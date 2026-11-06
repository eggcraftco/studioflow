"use client";

import { useState } from "react";
import Link from "@/lib/publicSite/PublicLink";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import { SHOPIFY_APP_STORE_URL } from "@/lib/studioflow/shopifyListing";
import type { PublicSiteTranslationKey } from "@/lib/publicSite/translations";
import styles from "./integrations.module.css";

/**
 * The app's own groups, in the app's words (owner, 31 October 2026: the site and the app must
 * name the same integrations the same way). The first four are INTEGRATION_CATEGORIES in
 * lib/studioflow/integrations.ts; "Shipping" and "Tracking" are the app's DHL Express and
 * 17TRACK sections in Settings ▸ Integrations. scripts/check-site-integration-names.mts keeps
 * every card's name and group equal to the app's tile.
 */
const categories = ["All integrations", "Commerce & orders", "Banking & accounting", "Payments, files & automation", "Customer messaging", "Shipping", "Tracking"] as const;
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
 *
 * Parity pass, 31 October 2026 (owner: the app and the site must list the same integrations
 * under the same names). Every Settings ▸ Integrations tile now has a card with the tile's name
 * and group: TrueLayer is shown as "Open Banking", Instagram Direct as "Instagram", QuickBooks as
 * "QuickBooks Online", and eight cards were added — Claude, Wix, Squarespace, Zapier, Make,
 * Cloud storage, 17TRACK tracking (Live) and Pandle (Coming soon). Twilio stays: SMS is a
 * Settings section of its own in the app, not a tile. Read that day:
 *   Claude          claudeMcp ACTIVE; anyone adds it to Claude as a custom connector (the app's
 *                   tile connects on every plan); only the listing in Claude's own directory is
 *                   still in Anthropic's review, which the note says (claude-connector.md CL-1).
 *   Wix, Squarespace, Zapier, Make
 *                   one inbound order webhook (inboundOrderWebhook ACTIVE), the address and token
 *                   self-served from the tile; no provider app (other-integrations.md A).
 *   Cloud storage   the twelve own-cloud functions ACTIVE since 30 October 2026 23:38Z; Google
 *                   Drive connected end to end with a real account on 31 October; OneDrive,
 *                   Dropbox and Box not configured yet, which the note says (storage-providers.md).
 *   17TRACK         registerTracking, track17Webhook and the hourly refresh ACTIVE (17track.md).
 *   Pandle          functions deployed, no API credentials from Pandle: no one can connect.
 * Live 17, Limited access 6, Coming soon 1 — 24 cards.
 *
 * QuickBooks Online became live on 31 October 2026: Intuit moved NivaDesk to production, the QB-1
 * server package (both Intuit key sets) was read back in production, a real QuickBooks company
 * connected end to end on EGGcraft's pilot, and appConfig/quickbooks.production opens it to every
 * workspace ("*": true). Each owner connects their own company, read only; Xero stays on request
 * (docs/integrations/quickbooks.md). Live 18, Limited access 5, Coming soon 1 — 24 cards.
 */
type AvailabilityState = "live" | "limited" | "comingSoon";

/**
 * A card's summary or detail: an English literal (the page's marketing copy,
 * English by design) or a key of the public-site table. A sentence added or
 * rewritten since 28 September 2026 is a key, so it reads in all twelve
 * languages like the labels and notes do.
 */
type CardText = string | { key: PublicSiteTranslationKey };

/**
 * Names only, no brand marks (owner, 31 October 2026: every logo off the integrations page, the
 * names stay). A card carries no logo file, initial tile or link to the provider's site; the
 * hero diagram writes the same names. scripts/check-site-integration-names.mts keeps it so.
 */
type Integration = {
  name: string;
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
  { name: "Shopify", category: "Commerce & orders", summary: "Bring your online shop orders into your workshop.", detail: { key: "integrations.detail.shopify" }, state: "live", note: "integrations.note.shopify" },
  { name: "Etsy", category: "Commerce & orders", summary: "From handmade marketplace orders to work ready to organise.", detail: "Connect your Etsy shop yourself from Settings → Integrations (one shop per workspace), preview what an import would bring, then import. After that, new orders, changes and shipping updates arrive from Etsy as they happen, NivaDesk checks your shop about once an hour for anything missed, and Sync now is there when you would rather not wait. Etsy approved our commercial access on 24 October 2026. The connection only reads your shop: it does not send tracking numbers or stock back to Etsy and does not change your listings. Etsy fees are shown as an estimate unless the actual fees are known.", state: "live" },
  { name: "WooCommerce", category: "Commerce & orders", summary: "Connect your WordPress shop with the work behind each order.", detail: "Approve NivaDesk at your store once; orders, customers and status changes then sync on their own, with a preview before any import. You can connect more than one store. Publishing products and updating stock in your store are not part of this connection; linking your store's products to NivaDesk inventory is available on request.", state: "live" },
  // Wix and Squarespace, 31 October 2026 (parity with the app): the app's tiles open the one
  // inbound order webhook, which every workspace self-serves; there is no Wix or Squarespace app.
  { name: "Wix", category: "Commerce & orders", summary: { key: "integrations.summary.wix" }, detail: { key: "integrations.detail.webhook" }, state: "live", note: "integrations.note.webhook" },
  { name: "Squarespace", category: "Commerce & orders", summary: { key: "integrations.summary.squarespace" }, detail: { key: "integrations.detail.webhook" }, state: "live", note: "integrations.note.webhook" },
  { name: "Xero", category: "Banking & accounting", summary: "Give your accounting workflow a connection to your daily work.", detail: "A read-only Xero connection: NivaDesk reads your organisation, chart of accounts, VAT rates, contacts and items, and never writes anything back. So far it has run against Xero's demo company only, so the first customer organisations are connected with us, on request. Xero also limits an app like ours to a small number of organisations.", state: "limited", note: "integrations.note.xero" },
  { name: "QuickBooks Online", category: "Banking & accounting", summary: "Keep your workshop and accounting workflow connected.", detail: "Connect your own QuickBooks Online company from Settings ▸ Integrations, read only: NivaDesk reads your chart of accounts, VAT codes, customers, suppliers and items, proposes the mappings your accountant confirms, and never posts anything back.", state: "live" },
  { name: "Square", category: "Commerce & orders", summary: "See Square orders and payouts in the context of your business.", detail: "Square orders, payments, refunds and payouts arrive in NivaDesk as they happen, with a reconciliation sweep behind the webhooks. Payout-to-bank matching is built but has not yet run on a real payout, so treat that part as new. This is not an in-app payment terminal.", state: "live" },
  { name: "PayPal", category: "Banking & accounting", summary: "Make sense of payout activity alongside your bank records.", detail: "A PayPal money feed on the Pro and Team plans. You create a PayPal app of your own and switch on Transaction Search, so it is a guided setup rather than one click. A payout stays separate from the sale, so it is never counted as new revenue; payout-to-bank matching has not processed a real payout yet.", state: "live" },
  { name: "Open Banking", category: "Banking & accounting", summary: "Bring supported bank transactions into your financial overview.", detail: "Read-only Open Banking through TrueLayer, on the Pro and Team plans: transactions from your business bank arrive alongside your orders, ready to categorise and match. Bank and regional coverage depend on the provider, and your consent is renewed about every 90 days.", state: "live" },
  // Pandle, 31 October 2026: the app's tile is "planned" — built, but no API credentials from Pandle.
  { name: "Pandle", category: "Banking & accounting", summary: { key: "integrations.summary.pandle" }, detail: { key: "integrations.detail.pandle" }, state: "comingSoon", note: "integrations.note.pandle" },
  { name: "Twilio", category: "Customer messaging", summary: "Keep customers informed as their work moves forward.", detail: "Customer SMS notifications on the Pro and Team plans: your workspace settings decide which order updates go out. Messages are sent through Twilio from the NivaDesk sender name. Today SMS runs as a pilot for one business; it is not yet open to other businesses. Messaging charges apply.", state: "limited", note: "integrations.note.twilio" },
  { name: "ChatGPT", category: "Payments, files & automation", summary: "A conversational way to work with your NivaDesk information.", detail: "The NivaDesk app is published in the ChatGPT app directory: connect your workspace once and read orders, notes and finances, or make supported updates, from a conversation.", state: "live" },
  // Claude, 31 October 2026: live as a custom connector for anyone (the app's tile connects on
  // every plan); the listing in Claude's own directory is the part still in review.
  { name: "Claude", category: "Payments, files & automation", summary: { key: "integrations.summary.claude" }, detail: { key: "integrations.detail.claude" }, state: "live", note: "integrations.note.claude" },
  { name: "WhatsApp", category: "Customer messaging", summary: "Customer conversations connected to the work they belong to.", detail: "A customer inbox for WhatsApp on the Team plan: messages from your customers arrive in NivaDesk, your team replies, and each conversation can be linked to the order it belongs to. It runs for one business today, on a Meta test number; connecting other businesses waits on Meta's approval. No automated messaging and no outbound campaigns.", state: "limited", note: "integrations.note.whatsapp" },
  // Instagram Direct and DHL Express, added 28 September 2026 (second pass). Instagram
  // is open to one workspace only (appConfig/instagram); DHL to every workspace
  // since 28 October 2026 (appConfig/shipping). Shown as "Instagram", the app tile's
  // name, since 31 October 2026.
  { name: "Instagram", category: "Customer messaging", summary: { key: "integrations.summary.instagram" }, detail: { key: "integrations.detail.instagram" }, state: "limited", note: "integrations.note.instagram" },
  // eBay, 1 October 2026: a production, read-only connection accepted by eBay on a
  // real seller account; open to every workspace once "ebay:*" is true in
  // appConfig/commerce.connectors.workspaces (the owner's switch, 29 October 2026 package).
  { name: "eBay", category: "Commerce & orders", summary: { key: "integrations.summary.ebay" }, detail: { key: "integrations.detail.ebay" }, state: "live", note: "integrations.note.ebay" },
  // Amazon, 30 October 2026: no logo file. Amazon's Website Guidelines for solution providers
  // and its Trademark Usage Guidelines allow its marks only with Amazon's written approval, and
  // a logo on this page was a listed reason to refuse the Appstore listing. The detail states
  // facts only — nothing that reads as Amazon's endorsement of NivaDesk.
  { name: "Amazon", category: "Commerce & orders", summary: "Marketplace order visibility, with a careful approach to customer data.", detail: "The Amazon connection is complete on our side, with Amazon data kept in a separate, hardened environment. The app is still in Amazon's review, so a seller cannot authorise it yet. It reads orders only: NivaDesk makes no listing, price or stock changes on Amazon.", state: "limited", note: "integrations.note.amazon" },
  { name: "DHL Express", category: "Shipping", summary: { key: "integrations.summary.dhl" }, detail: { key: "integrations.detail.dhl" }, state: "live", note: "integrations.note.dhl" },
  // 17TRACK, 31 October 2026: the app's "17TRACK tracking" tile, in its Tracking section.
  { name: "17TRACK tracking", category: "Tracking", summary: { key: "integrations.summary.tracking" }, detail: { key: "integrations.detail.tracking" }, state: "live" },
  // Stripe (card payment links), STRIPE-LINKS 29–30 October 2026: payment links paid into each
  // business's own Stripe account (Connect, direct charges), live Stripe mode, open to every
  // workspace (STRIPE_CONNECT_OPEN_TO_ALL).
  { name: "Stripe", category: "Payments, files & automation", summary: { key: "integrations.summary.stripe" }, detail: { key: "integrations.detail.stripe" }, state: "live", note: "integrations.note.stripe" },
  // Zapier, Make and Cloud storage, 31 October 2026 (parity with the app). Cloud storage: Google
  // Drive open to every workspace owner since 30 October 2026; OneDrive, Dropbox and Box are not
  // configured yet, and the note says so.
  { name: "Zapier", category: "Payments, files & automation", summary: { key: "integrations.summary.zapier" }, detail: { key: "integrations.detail.webhook" }, state: "live", note: "integrations.note.webhook" },
  { name: "Make", category: "Payments, files & automation", summary: { key: "integrations.summary.make" }, detail: { key: "integrations.detail.webhook" }, state: "live", note: "integrations.note.webhook" },
  { name: "Cloud storage", category: "Payments, files & automation", summary: { key: "integrations.summary.cloudstorage" }, detail: { key: "integrations.detail.cloudstorage" }, state: "live", note: "integrations.note.cloudstorage" },
  // Calendar, 31 October 2026 (parity with the app's Settings ▸ Integrations tile). Google Calendar and Outlook,
  // read only, one person's own calendar. Both switches (appConfig/calendarConnectors google + microsoft) are
  // "on" for every workspace since 31 October 2026 ~23:00Z, Google's OAuth verification was approved on 31 October
  // 2026, and the web Calendar has run since 30 October. Microsoft's publisher verification (Partner Center) was
  // completed on 6 November 2026 (verified publisher on the Entra apps); the note says so and that some organisations
  // still ask an administrator to approve new apps on work or school accounts. The apps do not have the
  // Calendar yet; the detail says "web app today".
  { name: "Calendar", category: "Payments, files & automation", summary: { key: "integrations.summary.calendar" }, detail: { key: "integrations.detail.calendar" }, state: "live", note: "integrations.note.calendar" },
];

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
          <div className={`${styles.serviceNode} ${styles.nodeShopify}`}>Shopify</div>
          <div className={`${styles.serviceNode} ${styles.nodeEtsy}`}>Etsy</div>
          <div className={`${styles.serviceNode} ${styles.nodeSquare}`}>Square</div>
          <div className={`${styles.serviceNode} ${styles.nodeWooCommerce}`}>WooCommerce</div>
          <div className={`${styles.serviceNode} ${styles.nodePayPal}`}>PayPal</div>
          <div className={`${styles.serviceNode} ${styles.nodeChatGpt}`}>ChatGPT</div>
          <div className={styles.hub}><img src="/brand/nivadesk-logo-dark.png" alt="NivaDesk" width={178} height={45} /><span>Your business, connected.</span></div>
          <div className={`${styles.ghostNode} ${styles.ghostTop}`} aria-hidden="true">eBay</div><div className={`${styles.ghostNode} ${styles.ghostLeft}`} aria-hidden="true">Xero</div><div className={`${styles.ghostNode} ${styles.ghostRight}`} aria-hidden="true">Twilio</div><div className={`${styles.ghostNode} ${styles.ghostBottom}`} aria-hidden="true">WhatsApp</div>
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
      <div><p className={styles.results} role="status">{filtered.length} {filtered.length === 1 ? "integration" : "integrations"}{query && ` matching “${query}”`}</p><div className={styles.grid}>{filtered.map(item => <article key={item.name} className={styles.card}><p className={styles.category}>{item.category}</p><h3>{item.name}</h3><p className={styles.summary} {...cardLang(item.summary)}>{cardText(item.summary)}</p><span className={`${styles.status} ${stateClass[item.state]}`} lang={locale} dir="auto">{t(STATE_LABEL[item.state])}</span>{item.note && <p className={styles.note} lang={locale} dir="auto">{t(item.note)}</p>}{item.name === "Amazon" && <Link className={styles.cardLink} href="/integrations/amazon" lang={locale} dir="auto">{t("integrations.action.amazonPage")} →</Link>}{item.name === "Shopify" && <Link className={styles.cardLink} href="/integrations/shopify" lang={locale} dir="auto">{t("integrations.action.shopifyPage")} →</Link>}{item.name === "Claude" && <Link className={styles.cardLink} href="/integrations/claude" lang={locale} dir="auto">{t("integrations.action.claudePage")} →</Link>}<details className={styles.detail}><summary>What to expect <span aria-hidden="true">+</span></summary><p {...cardLang(item.detail)}>{cardText(item.detail)}</p>{item.name === "ChatGPT"
        ? <Link href="/chatgpt" lang={locale} dir="auto">{t("integrations.action.chatgpt")} ↗</Link>
        : item.name === "Claude"
          ? <Link href="/integrations/claude#connect" lang={locale} dir="auto">{t("integrations.action.claudePage")} ↗</Link>
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
