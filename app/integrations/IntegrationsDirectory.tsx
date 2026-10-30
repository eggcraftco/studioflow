"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import { SHOPIFY_APP_STORE_URL } from "@/lib/studioflow/shopifyListing";
import type { PublicSiteTranslationKey } from "@/lib/publicSite/translations";
import styles from "./integrations.module.css";

const categories = ["All integrations", "Commerce", "Accounting & banking", "Payments", "Shipping", "Communication", "AI"] as const;
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
 * Today: 10 live (Shopify since 14 October 2026, Etsy from the 28 October 2026
 * pass, DHL Express from 28 October 2026 (late), eBay once the switch below is
 * open, WooCommerce, Square, PayPal, TrueLayer, ChatGPT, Stripe payment links since the
 * STRIPE_CONNECT_OPEN_TO_ALL switch of 30 October 2026), 6 limited (Xero, QuickBooks,
 * Twilio, WhatsApp, Instagram Direct, Amazon) — 16 cards. The 28 October 2026 pass re-read every card
 * against the integration status records (docs/integrations/<slug>.md in the
 * main repository, §1 and §5): Etsy became live (commercial access approved
 * 24 October 2026, any seller connects on their own, read only), and sentences
 * the records no longer support were corrected or removed.
 * DHL Express became live late on 28 October 2026: appConfig/shipping opens it
 * to every workspace ("*": true), and the first business's connection was
 * saved in DHL production (the key is checked against DHL before it is stored).
 * What stands between a business and a label is its own MyDHL API access, which
 * DHL issues per DHL Express account (test key first, production when DHL
 * decides) — the provider's own account set-up, like PayPal's app, not an
 * approval NivaDesk is waiting for; the note says how to ask for it. No
 * production label had been created by then (docs/integrations/dhl-express.md
 * section 4). scripts/check-dhl-texts.mts keeps the card and the app in step.
 * eBay is live from the day appConfig/commerce.connectors.workspaces carries
 * "ebay:*": true (29 October 2026 package; until then this page is not
 * published). Read on 29 October 2026: every eBay function runs against eBay
 * production, the first seller account has been connected there since
 * 1 October and syncs every fifteen minutes, eBay's marketplace account
 * deletion notices are processed, and the only switch in front of Connect was
 * that list of named workspaces. Connecting needs no plan; a plan's order limit
 * parks new orders as it does for every channel. Listing and stock links stay
 * a per-workspace pilot (appConfig/ebayInventory) and are not on this card.
 * Shopify: the app was published on the Shopify App Store on 12 October 2026
 * (Shopify's e-mail, relayed by the owner); no per-workspace switch stands in
 * front of the connect (shopifyCompleteConnect checks the install and the
 * one-time code only). Its card links to the listing, because a Shopify
 * connection starts in the merchant's Shopify admin, not in Settings. The evidence per row
 * is in docs/deploys/site-integrations-2026-09-28/README.md and, for the
 * second pass that added Instagram Direct and DHL Express and corrected the
 * Shopify sentence, docs/deploys/site-integrations-update-2026-09-28/README.md.
 * Stripe (card payment links) is live since 30 October 2026: STRIPE_CONNECT_OPEN_TO_ALL lets
 * any business connect its own Stripe account from Settings → Integrations. This card goes
 * out only after that switch has been read back in production (docs/integrations/
 * stripe-connect.md; scripts/check-stripe-card.mts keeps the card's claims to what the code does).
 * When a state changes, change it here and in that record on the same day.
 */
type AvailabilityState = "live" | "limited" | "comingSoon";

/**
 * A card's summary or detail: an English literal (the page's marketing copy,
 * English by design) or a key of the public-site table. A sentence added or
 * rewritten since 28 September 2026 is a key, so it reads in all twelve
 * languages like the labels and notes do.
 */
type CardText = string | { key: PublicSiteTranslationKey };

type Integration = {
  name: string;
  /** The brand's own file. Without one we may use, the tile shows `mark` instead; a mark is never redrawn. */
  logo?: string;
  mark?: string;
  website: string;
  category: Category;
  summary: CardText;
  detail: CardText;
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
  { name: "Shopify", logo: "/integration-logos/shopify.svg", website: "https://www.shopify.com/", category: "Commerce", summary: "Bring your online shop orders into your workshop.", detail: { key: "integrations.detail.shopify" }, state: "live", note: "integrations.note.shopify" },
  { name: "Etsy", logo: "/integration-logos/etsy.svg", website: "https://www.etsy.com/", category: "Commerce", summary: "From handmade marketplace orders to work ready to organise.", detail: "Connect your Etsy shop yourself from Settings → Integrations (one shop per workspace), preview what an import would bring, then import. After that, new orders, changes and shipping updates arrive from Etsy as they happen, NivaDesk checks your shop about once an hour for anything missed, and Sync now is there when you would rather not wait. Etsy approved our commercial access on 24 October 2026. The connection only reads your shop: it does not send tracking numbers or stock back to Etsy and does not change your listings. Etsy fees are shown as an estimate unless the actual fees are known.", state: "live" },
  { name: "WooCommerce", logo: "/integration-logos/woocommerce.svg", website: "https://woocommerce.com/", category: "Commerce", summary: "Connect your WordPress shop with the work behind each order.", detail: "Approve NivaDesk at your store once; orders, customers and status changes then sync on their own, with a preview before any import. You can connect more than one store. Publishing products and updating stock in your store are not part of this connection; linking your store's products to NivaDesk inventory is available on request.", state: "live" },
  { name: "Xero", logo: "/integration-logos/xero.svg", website: "https://www.xero.com/", category: "Accounting & banking", summary: "Give your accounting workflow a connection to your daily work.", detail: "A read-only Xero connection: NivaDesk reads your organisation, chart of accounts, VAT rates, contacts and items, and never writes anything back. So far it has run against Xero's demo company only, so the first customer organisations are connected with us, on request. Xero also limits an app like ours to a small number of organisations.", state: "limited", note: "integrations.note.xero" },
  { name: "QuickBooks", logo: "/integration-logos/quickbooks.png", website: "https://quickbooks.intuit.com/", category: "Accounting & banking", summary: "Keep your workshop and accounting workflow connected.", detail: "A read-only QuickBooks connection is built: NivaDesk reads your chart of accounts, VAT codes, customers and items, and never posts anything back. Today it runs with Intuit's development keys, which only sandbox companies can use, so a real QuickBooks company cannot connect until production access is arranged.", state: "limited", note: "integrations.note.quickbooks" },
  { name: "Square", logo: "/integration-logos/square.svg", website: "https://squareup.com/", category: "Payments", summary: "See Square orders and payouts in the context of your business.", detail: "Square orders, payments, refunds and payouts arrive in NivaDesk as they happen, with a reconciliation sweep behind the webhooks. Payout-to-bank matching is built but has not yet run on a real payout, so treat that part as new. This is not an in-app payment terminal.", state: "live" },
  { name: "PayPal", logo: "/integration-logos/paypal.png", website: "https://www.paypal.com/", category: "Payments", summary: "Make sense of payout activity alongside your bank records.", detail: "A PayPal money feed on the Pro and Team plans. You create a PayPal app of your own and switch on Transaction Search, so it is a guided setup rather than one click. A payout stays separate from the sale, so it is never counted as new revenue; payout-to-bank matching has not processed a real payout yet.", state: "live" },
  { name: "TrueLayer", logo: "/integration-logos/truelayer.svg", website: "https://truelayer.com/", category: "Accounting & banking", summary: "Bring supported bank transactions into your financial overview.", detail: "Read-only Open Banking through TrueLayer, on the Pro and Team plans: transactions from your business bank arrive alongside your orders, ready to categorise and match. Bank and regional coverage depend on the provider, and your consent is renewed about every 90 days.", state: "live" },
  { name: "Twilio", logo: "/integration-logos/twilio.png", website: "https://www.twilio.com/", category: "Communication", summary: "Keep customers informed as their work moves forward.", detail: "Customer SMS notifications on the Pro and Team plans: your workspace settings decide which order updates go out. Messages are sent through Twilio from the NivaDesk sender name. Today SMS runs as a pilot for one business; it is not yet open to other businesses. Messaging charges apply.", state: "limited", note: "integrations.note.twilio" },
  { name: "ChatGPT", logo: "/integration-logos/chatgpt.svg", website: "https://chatgpt.com/", category: "AI", summary: "A conversational way to work with your NivaDesk information.", detail: "The NivaDesk app is published in the ChatGPT app directory: connect your workspace once and read orders, notes and finances, or make supported updates, from a conversation.", state: "live" },
  { name: "WhatsApp", logo: "/integration-logos/whatsapp.svg", website: "https://www.whatsapp.com/", category: "Communication", summary: "Customer conversations connected to the work they belong to.", detail: "A customer inbox for WhatsApp on the Team plan: messages from your customers arrive in NivaDesk, your team replies, and each conversation can be linked to the order it belongs to. It runs for one business today, on a Meta test number; connecting other businesses waits on Meta's approval. No automated messaging and no outbound campaigns.", state: "limited", note: "integrations.note.whatsapp" },
  // Instagram Direct and DHL Express, added 28 September 2026 (second pass). Instagram
  // is open to one workspace only (appConfig/instagram); DHL to every workspace
  // since 28 October 2026 (appConfig/shipping). No
  // logo file: the marks are Meta's and DHL's and are not redrawn, so the tiles
  // keep an initial, as the app's own integration tiles do.
  { name: "Instagram Direct", mark: "I", website: "https://www.instagram.com/", category: "Communication", summary: { key: "integrations.summary.instagram" }, detail: { key: "integrations.detail.instagram" }, state: "limited", note: "integrations.note.instagram" },
  // eBay, 1 October 2026: a production, read-only connection accepted by eBay on a
  // real seller account; open to every workspace once "ebay:*" is true in
  // appConfig/commerce.connectors.workspaces (the owner's switch, 29 October 2026 package).
  { name: "eBay", logo: "/integration-logos/ebay.svg", website: "https://www.ebay.com/", category: "Commerce", summary: { key: "integrations.summary.ebay" }, detail: { key: "integrations.detail.ebay" }, state: "live", note: "integrations.note.ebay" },
  // Amazon, 30 October 2026: no logo file. Amazon's Website Guidelines for solution providers
  // and its Trademark Usage Guidelines allow its marks only with Amazon's written approval, and
  // a logo on this page was a listed reason to refuse the Appstore listing; the tile keeps an
  // initial, like Meta's, DHL's and Stripe's. The detail states facts only — nothing that reads
  // as Amazon's endorsement of NivaDesk.
  { name: "Amazon", mark: "A", website: "https://www.amazon.com/", category: "Commerce", summary: "Marketplace order visibility, with a careful approach to customer data.", detail: "The Amazon connection is complete on our side, with Amazon data kept in a separate, hardened environment. The app is still in Amazon's review, so a seller cannot authorise it yet. It reads orders only: NivaDesk makes no listing, price or stock changes on Amazon.", state: "limited", note: "integrations.note.amazon" },
  { name: "DHL Express", mark: "D", website: "https://www.dhl.com/", category: "Shipping", summary: { key: "integrations.summary.dhl" }, detail: { key: "integrations.detail.dhl" }, state: "live", note: "integrations.note.dhl" },
  // Stripe (card payment links), STRIPE-LINKS 29–30 October 2026: payment links paid into each
  // business's own Stripe account (Connect, direct charges), live Stripe mode, open to every
  // workspace (STRIPE_CONNECT_OPEN_TO_ALL). No logo file: the mark is Stripe's and is not
  // redrawn, so the tile keeps an initial, as the app's own Stripe tile does.
  { name: "Stripe", mark: "S", website: "https://stripe.com/", category: "Payments", summary: { key: "integrations.summary.stripe" }, detail: { key: "integrations.detail.stripe" }, state: "live", note: "integrations.note.stripe" },
];

const logoVariants: Record<string, string> = {
  WooCommerce: styles.wooBrand,
  PayPal: styles.paypalBrand,
  ChatGPT: styles.chatgptBrand,
  WhatsApp: styles.whatsAppBrand,
};

function IntegrationsDirectoryContent() {
  // The marketing copy of this page is English by design (lang="en" below).
  // The availability labels, the legend, the card actions and the honest
  // sentence on a limited card are the parts a visitor must be able to read in
  // their own language, so those come from the public-site translation table.
  const { t, locale } = usePublicSiteLanguage();
  const [category, setCategory] = useState<Category>("All integrations");
  const [query, setQuery] = useState("");
  // A translated sentence carries the visitor's language on its own element;
  // an English literal stays under the page's lang="en".
  const cardText = (text: CardText) => typeof text === "string" ? text : t(text.key);
  const cardLang = (text: CardText) => typeof text === "string" ? {} : { lang: locale, dir: "auto" as const };
  const filtered = integrations.filter(item => (category === "All integrations" || item.category === category) && `${item.name} ${cardText(item.summary)} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));
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
          <div className={`${styles.serviceNode} ${styles.nodeSquare}`}><img src="/integration-logos/square.svg" alt="Square" width={56} height={32} /></div>
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
      <div><p className={styles.results} role="status">{filtered.length} {filtered.length === 1 ? "integration" : "integrations"}{query && ` matching “${query}”`}</p><div className={styles.grid}>{filtered.map(item => <article key={item.name} className={styles.card}><div className={styles.cardTop}><a className={`${styles.brand} ${logoVariants[item.name] ?? ""}`} href={item.website} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} official website`}>{item.logo ? <img src={item.logo} alt={`${item.name} logo`} width={112} height={48} loading="lazy" /> : <span className={styles.brandMark} aria-hidden="true">{item.mark}</span>}</a><span className={styles.category}>{item.category}</span></div><h3>{item.name}</h3><p className={styles.summary} {...cardLang(item.summary)}>{cardText(item.summary)}</p><span className={`${styles.status} ${stateClass[item.state]}`} lang={locale} dir="auto">{t(STATE_LABEL[item.state])}</span>{item.note && <p className={styles.note} lang={locale} dir="auto">{t(item.note)}</p>}{item.name === "Amazon" && <Link className={styles.cardLink} href="/integrations/amazon" lang={locale} dir="auto">{t("integrations.action.amazonPage")} →</Link>}{item.name === "Shopify" && <Link className={styles.cardLink} href="/integrations/shopify" lang={locale} dir="auto">{t("integrations.action.shopifyPage")} →</Link>}<details className={styles.detail}><summary>What to expect <span aria-hidden="true">+</span></summary><p {...cardLang(item.detail)}>{cardText(item.detail)}</p>{item.name === "ChatGPT"
        ? <Link href="/chatgpt" lang={locale} dir="auto">{t("integrations.action.chatgpt")} ↗</Link>
        : item.name === "Shopify"
          ? <a href={SHOPIFY_APP_STORE_URL} target="_blank" rel="noopener noreferrer" lang={locale} dir="auto">{t("integrations.action.shopifyAppStore")} ↗</a>
        : item.state === "live"
          ? <Link href="/login" lang={locale} dir="auto">{t("integrations.action.connect")} ↗</Link>
          : <Link href="/contact" lang={locale} dir="auto">{t(item.state === "limited" ? "integrations.action.request" : "integrations.action.ask")} ↗</Link>}</details></article>)}</div>{!filtered.length && <div className={styles.empty}><h3>No matching integrations</h3><p>Try another name or explore all categories.</p><button onClick={() => {setQuery("");setCategory("All integrations");}}>Clear filters</button></div>}</div></div>
      <p className={styles.micro} lang="en">{"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}</p>
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
