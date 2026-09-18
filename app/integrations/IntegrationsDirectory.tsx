"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import styles from "./integrations.module.css";

const categories = ["All integrations", "Commerce", "Accounting & banking", "Payments", "Communication", "AI"] as const;
type Category = typeof categories[number];
type Integration = { name: string; logo: string; website: string; category: Category; summary: string; detail: string; status: "Explore integration" | "Access under review" | "Coming later"; };
const integrations: Integration[] = [
  { name: "Shopify", logo: "/integration-logos/shopify.svg", website: "https://www.shopify.com/", category: "Commerce", summary: "Bring your online shop orders into your workshop.", detail: "An official NivaDesk app for Shopify is built, and its App Store listing is still with Shopify. Talk to us about your shop and we will tell you exactly where that stands.", status: "Access under review" },
  { name: "Etsy", logo: "/integration-logos/etsy.svg", website: "https://www.etsy.com/", category: "Commerce", summary: "From handmade marketplace orders to work ready to organise.", detail: "An Etsy order connection has been built. General seller access is being verified before we offer self-service setup to everyone.", status: "Access under review" },
  { name: "WooCommerce", logo: "/integration-logos/woocommerce.svg", website: "https://woocommerce.com/", category: "Commerce", summary: "Connect your WordPress shop with the work behind each order.", detail: "Bring WooCommerce orders into your existing order workflow. Product publishing and stock updates are separate capabilities.", status: "Explore integration" },
  { name: "Xero", logo: "/integration-logos/xero.svg", website: "https://www.xero.com/", category: "Accounting & banking", summary: "Give your accounting workflow a connection to your daily work.", detail: "A read-only Xero connection: NivaDesk reads your organisation, chart of accounts, VAT rates, contacts and items, and never writes anything back. We connect a small number of organisations at a time, so talk to us before you set one up.", status: "Explore integration" },
  { name: "QuickBooks", logo: "/integration-logos/quickbooks.png", website: "https://quickbooks.intuit.com/", category: "Accounting & banking", summary: "Keep your workshop and accounting workflow connected.", detail: "A read-only QuickBooks connection is built: NivaDesk reads your chart of accounts, VAT codes, customers and items, and never posts anything back. Production access with Intuit is still being arranged, so please speak to us before connecting.", status: "Access under review" },
  { name: "Square", logo: "/integration-logos/square.svg", website: "https://squareup.com/", category: "Payments", summary: "See Square orders and payouts in the context of your business.", detail: "Square order workflows run in NivaDesk today. Payout records and payout-to-bank matching are built but have not yet run on real production data, so treat those as new. This is not an in-app payment terminal.", status: "Explore integration" },
  { name: "PayPal", logo: "/integration-logos/paypal.png", website: "https://www.paypal.com/", category: "Payments", summary: "Make sense of payout activity alongside your bank records.", detail: "A PayPal money feed on the Pro and Team plans. You create a PayPal app of your own and switch on Transaction Search, so it is a guided setup rather than one click. A payout stays separate from the sale, so it is never counted as new revenue; payout-to-bank matching has not processed a real payout yet.", status: "Explore integration" },
  { name: "TrueLayer", logo: "/integration-logos/truelayer.svg", website: "https://truelayer.com/", category: "Accounting & banking", summary: "Bring supported bank transactions into your financial overview.", detail: "Bank feeds help you review transactions alongside your business activity. Bank and regional coverage depend on the provider.", status: "Access under review" },
  { name: "Twilio", logo: "/integration-logos/twilio.png", website: "https://www.twilio.com/", category: "Communication", summary: "Keep customers informed as their work moves forward.", detail: "SMS notifications support your customer communication workflow. Sending depends on configuration, permissions and messaging charges.", status: "Access under review" },
  { name: "ChatGPT", logo: "/integration-logos/chatgpt.svg", website: "https://chatgpt.com/", category: "AI", summary: "A conversational way to work with your NivaDesk information.", detail: "The NivaDesk ChatGPT app is under review. Directory availability is not yet confirmed; visit our ChatGPT page to explore the approach.", status: "Explore integration" },
  { name: "WhatsApp", logo: "/integration-logos/whatsapp.svg", website: "https://www.whatsapp.com/", category: "Communication", summary: "Customer conversations connected to the work they belong to.", detail: "A WhatsApp connection is being developed. General messaging and outbound automation are not available yet.", status: "Coming later" },
  { name: "eBay", logo: "/integration-logos/ebay.svg", website: "https://www.ebay.com/", category: "Commerce", summary: "A future connection for marketplace orders and workshop work.", detail: "The connection is in testing and is not open for general use. Listing publication and marketplace stock updates are not available here.", status: "Coming later" },
  { name: "Amazon", logo: "/integration-logos/amazon.png", website: "https://www.amazon.com/", category: "Commerce", summary: "Marketplace order visibility, with a careful approach to customer data.", detail: "The Amazon integration is being prepared. General connection and listing management are not currently offered.", status: "Access under review" },
];

const logoVariants: Record<string, string> = {
  WooCommerce: styles.wooBrand,
  PayPal: styles.paypalBrand,
  ChatGPT: styles.chatgptBrand,
  WhatsApp: styles.whatsAppBrand,
  Amazon: styles.amazonBrand,
};

export default function IntegrationsDirectory() {
  const [category, setCategory] = useState<Category>("All integrations");
  const [query, setQuery] = useState("");
  const filtered = integrations.filter(item => (category === "All integrations" || item.category === category) && `${item.name} ${item.summary} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <PublicShell><div className={styles.page} lang="en" dir="ltr">
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
    <section id="directory" className={styles.directory}><div className={styles.directoryHeader}><div><p className={styles.eyebrow}>FIND YOUR CONNECTION</p><h2>A place for the tools<br />you already know.</h2></div><p>Explore current connection options and what is being prepared next. Availability can depend on your provider, account and region.</p></div>
      <div className={styles.layout}><aside className={styles.filters}><label htmlFor="integration-search">Find an integration</label><div className={styles.search}><span aria-hidden="true">⌕</span><input id="integration-search" type="search" placeholder="Search tools…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className={styles.categoryList} role="group" aria-label="Integration category">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}<span>{c === "All integrations" ? integrations.length : integrations.filter(i => i.category === c).length}</span></button>)}</div><p className={styles.filterNote}>Looking for something else?<br /><Link href="/contact">Tell us what you use ↗</Link></p></aside>
      <div><p className={styles.results} role="status">{filtered.length} {filtered.length === 1 ? "integration" : "integrations"}{query && ` matching “${query}”`}</p><div className={styles.grid}>{filtered.map(item => <article key={item.name} className={styles.card}><div className={styles.cardTop}><a className={`${styles.brand} ${logoVariants[item.name] ?? ""}`} href={item.website} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} official website`}><img src={item.logo} alt={`${item.name} logo`} width={112} height={48} loading="lazy" /></a><span className={styles.category}>{item.category}</span></div><h3>{item.name}</h3><p className={styles.summary}>{item.summary}</p><span className={`${styles.status} ${item.status === "Explore integration" ? styles.explore : styles.pending}`}>{item.status}</span><details className={styles.detail}><summary>What to expect <span aria-hidden="true">+</span></summary><p>{item.detail}</p><Link href={item.name === "ChatGPT" ? "/chatgpt" : "/contact"}>{item.name === "ChatGPT" ? "Explore NivaDesk for ChatGPT" : "Ask about this integration"} ↗</Link></details></article>)}</div>{!filtered.length && <div className={styles.empty}><h3>No matching integrations</h3><p>Try another name or explore all categories.</p><button onClick={() => {setQuery("");setCategory("All integrations");}}>Clear filters</button></div>}</div></div>
      <p className={styles.micro}>The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
    </section>
    <section className={styles.faq}><div><p className={styles.eyebrow}>A FEW USEFUL DETAILS</p><h2>Before you connect.</h2></div><div>{[
      ["Does connecting a shop also publish my products?", "No. Bringing orders into NivaDesk is separate from publishing listings, changing prices or sending stock quantities back to a marketplace. Check the supported scope of each connection."],
      ["Can I connect every integration shown here today?", "Some connections are being prepared or reviewed. Each card explains its current scope. Contact us to confirm availability for your account before choosing a connection."],
      ["Will an integration replace my existing workflow?", "The aim is to bring relevant information into your existing NivaDesk work. Your orders, workshop activity and financial records keep their distinct roles."],
      ["What if my tool is not listed?", "Tell us which tool you use and what you would like to bring into NivaDesk. This helps us understand the connections that matter to your business."]
    ].map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={styles.cta}><p className={styles.eyebrow}>MAKE ROOM FOR THE WORK</p><h2>Less switching.<br />More making.</h2><p>Let’s find the right connections for your business.</p><Link className={styles.primary} href="/contact">Talk to us <span aria-hidden="true">↗</span></Link></section>
  </div></PublicShell>;
}
