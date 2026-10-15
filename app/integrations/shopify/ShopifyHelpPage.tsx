"use client";

import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import { AMAZON_SELLER_COPY } from "@/lib/publicSite/amazonSellerCopy";
import { SHOPIFY_HELP_COPY, SHOPIFY_PLAN_PRICES_USD, type ShopifyHelpCopy } from "@/lib/publicSite/shopifyHelpCopy";
import { SHOPIFY_APP_STORE_URL } from "@/lib/studioflow/shopifyListing";
// The same palette, grid and RTL rules as /integrations/amazon; the two pages are siblings.
import styles from "../amazon/amazon.module.css";
import own from "./shopify.module.css";

const SUPPORT_EMAIL = "contact@nivadesk.co.uk";

// Example order numbers in the illustration: the shape of a Shopify order name, not a real order.
const SAMPLE_ORDER_NUMBERS = ["#1042", "#1041"] as const;

function Check() {
  return (
    <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 10.5l3.2 3.2L15.5 6" />
    </svg>
  );
}

function Cross() {
  return (
    <svg className={styles.crossIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  );
}

const JOB_ICONS = [
  <path key="bench" d="M3 15h14M5 15V9h10v6M8 9V6h4v3" />,
  <path key="list" d="M7 6h10M7 10h10M7 14h10M3.5 6h.01M3.5 10h.01M3.5 14h.01" />,
  <path key="sync" d="M15.5 8A6 6 0 005 6.5M4.5 12A6 6 0 0015 13.5M15.5 4v4h-4M4.5 16v-4h4" />,
  <path key="filter" d="M3.5 5h13l-5 6v4.5l-3 1.5V11z" />
];

/** The order list, drawn from the real list's parts: channel badge, item, number, status. */
function OrderListMock({ copy, shared }: { copy: ShopifyHelpCopy; shared: { orders: string; manual: string; statusNew: string; statusMaking: string } }) {
  const rows = [
    { channel: "Shopify", item: copy.mockItems[0], number: SAMPLE_ORDER_NUMBERS[0], status: shared.statusNew, tone: styles.toneNew },
    { channel: "Shopify", item: copy.mockItems[1], number: SAMPLE_ORDER_NUMBERS[1], status: copy.mockStatusDispatched, tone: own.toneDispatched },
    { channel: shared.manual, item: copy.mockItems[2], number: "", status: shared.statusMaking, tone: styles.toneMaking, manual: true }
  ];
  return (
    <figure className={styles.mockFigure}>
      <div className={styles.mockWindow} role="img" aria-label={copy.mockLabel}>
        <div className={styles.mockBar} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.mockHead} aria-hidden="true">
          <strong>{shared.orders}</strong>
        </div>
        <ul className={styles.mockRows} aria-hidden="true">
          {rows.map(row => (
            <li key={row.item} className={styles.mockRow}>
              <span className={row.manual ? styles.badgeManual : own.badgeShopify}>{row.channel}</span>
              <span className={styles.mockItem}>
                <b>{row.item}</b>
                {row.number ? <small dir="ltr">{row.number}</small> : <small>&nbsp;</small>}
              </span>
              <span className={`${styles.mockStatus} ${row.tone}`}>{row.status}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className={styles.mockCaption}>{copy.mockCaption}</figcaption>
    </figure>
  );
}

function ShopifyHelpContent() {
  const { language } = usePublicSiteLanguage();
  const copy = SHOPIFY_HELP_COPY[language] ?? SHOPIFY_HELP_COPY.English;
  // Labels shared with the Amazon page, already translated there (one source, no drift).
  const amazon = AMAZON_SELLER_COPY[language] ?? AMAZON_SELLER_COPY.English;
  const shared = { orders: amazon.mockOrdersTitle, manual: amazon.mockManual, statusNew: amazon.mockStatusNew, statusMaking: amazon.mockStatusMaking };
  const planNote = copy.planNotes;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="shopify-help-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="shopify-help-title">{copy.heroTitle}</h1>
          <p className={styles.intro}>{copy.heroIntro}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href={SHOPIFY_APP_STORE_URL} target="_blank" rel="noopener noreferrer">{copy.ctaInstall} <span className={styles.flip} aria-hidden="true">↗</span></a>
            <a className={styles.secondary} href="#install">{copy.ctaSteps}</a>
          </div>
          <ul className={styles.heroFacts}>
            {copy.heroFacts.map(fact => <li key={fact}><Check />{fact}</li>)}
          </ul>
        </div>
        <OrderListMock copy={copy} shared={shared} />
      </section>

      <section className={`${styles.statusBand} ${own.statusLive}`} aria-labelledby="shopify-status-title">
        <div className={styles.statusInner}>
          <div className={styles.statusHead}>
            <p className={`${styles.statusEyebrow} ${own.liveEyebrow}`} id="shopify-status-title">{copy.statusTitle}</p>
            <span className={`${styles.statusBadge} ${own.liveBadge}`}><span className={`${styles.statusDot} ${own.liveDot}`} aria-hidden="true" />{copy.statusLabel}</span>
          </div>
          <p className={own.liveBody}>{copy.statusBody}</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="shopify-jobs">
        <h2 id="shopify-jobs">{copy.jobsTitle}</h2>
        <p className={styles.lead}>{copy.jobsIntro}</p>
        <div className={styles.jobGrid}>
          {copy.jobs.map(([title, body], index) => (
            <article key={title} className={styles.job}>
              <svg className={styles.jobIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{JOB_ICONS[index % JOB_ICONS.length]}</svg>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="shopify-direction">
        <h2 id="shopify-direction">{copy.directionTitle}</h2>
        <div className={styles.direction}>
          <div className={styles.reads}>
            <h3>{copy.readsTitle}</h3>
            <ul>{copy.reads.map(line => <li key={line}><Check />{line}</li>)}</ul>
          </div>
          <div className={styles.writes}>
            <h3>{copy.writesTitle}</h3>
            <ul>{copy.writes.map(line => <li key={line}><Cross />{line}</li>)}</ul>
          </div>
        </div>
        <p className={styles.note}>{copy.directionNote}</p>
        <h3 className={styles.subhead}>{copy.syncTitle}</h3>
        <dl className={styles.factGrid}>
          {copy.syncFacts.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section id="install" className={`${styles.section} ${own.anchor}`} aria-labelledby="shopify-connect">
        <h2 id="shopify-connect">{copy.connectTitle}</h2>
        <ol className={styles.steps}>
          {copy.connectSteps.map(([title, body], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
        {copy.connectNotes.map(note => <p key={note} className={styles.note}>{note}</p>)}
      </section>

      <section id="plans" className={`${styles.section} ${own.anchor}`} aria-labelledby="shopify-pricing">
        <h2 id="shopify-pricing">{copy.pricingTitle}</h2>
        <p className={styles.lead}>{copy.pricingIntro}</p>
        <div className={styles.plans}>
          {SHOPIFY_PLAN_PRICES_USD.map(plan => (
            <article key={plan.id} className={styles.plan}>
              <h3>{plan.name ?? amazon.planFree}</h3>
              <p className={styles.price}>
                <span dir="ltr">{plan.monthly}</span> <small>{amazon.perMonth}</small>
              </p>
              <p className={styles.priceYear}>{plan.id === "free" ? " " : copy.perPeriod}</p>
              <p className={styles.planNote}>{planNote[plan.id]}</p>
            </article>
          ))}
        </div>
        <p className={styles.note}>{copy.trialNote}</p>
        <dl className={`${styles.limitList} ${own.billingFacts}`}>
          {copy.billingFacts.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section id="limit" className={`${styles.section} ${own.anchor}`} aria-labelledby="shopify-limit">
        <h2 id="shopify-limit">{copy.limitTitle}</h2>
        <p className={styles.lead}>{copy.limitIntro}</p>
        <dl className={styles.limitList}>
          {copy.limitPoints.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section id="import" className={`${styles.section} ${own.anchor}`} aria-labelledby="shopify-import">
        <h2 id="shopify-import">{copy.importTitle}</h2>
        <p className={styles.lead}>{copy.importIntro}</p>
        <ol className={styles.steps}>
          {copy.importSteps.map(([title, body], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
        <p className={styles.note}>{copy.importNote}</p>
      </section>

      <section id="data" className={`${styles.section} ${own.anchor}`} aria-labelledby="shopify-data">
        <h2 id="shopify-data">{copy.dataTitle}</h2>
        <dl className={styles.dataList}>
          {copy.data.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
        <h3 className={styles.subhead}>{amazon.legalTitle}</h3>
        <ul className={styles.links}>
          <li><Link href="/privacy">{amazon.linkPrivacy}</Link></li>
          <li><Link href="/terms">{amazon.linkTerms}</Link></li>
          <li><Link href="/security">{amazon.linkSecurity}</Link></li>
          <li><Link href="/subprocessors">{amazon.linkSubprocessors}</Link></li>
          <li><Link href="/account-deletion">{amazon.linkDeletion}</Link></li>
        </ul>
      </section>

      <section id="faq" className={`${styles.section} ${own.anchor}`} aria-labelledby="shopify-faq">
        <h2 id="shopify-faq">{copy.faqTitle}</h2>
        <div className={styles.faq}>
          {copy.faq.map(([question, answer]) => (
            <details key={question} className={styles.faqItem}>
              <summary><span>{question}</span><span className={styles.faqMark} aria-hidden="true">+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="support" className={`${styles.section} ${styles.contact} ${own.anchor}`} aria-labelledby="shopify-contact">
        <h2 id="shopify-contact">{copy.contactTitle}</h2>
        <p className={styles.lead}>{copy.contactBody}</p>
        <p className={styles.contactLine}>
          {amazon.contactEmailLabel}: <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">{SUPPORT_EMAIL}</a>
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/contact">{amazon.contactPage}</Link>
          <a className={styles.secondary} href={SHOPIFY_APP_STORE_URL} target="_blank" rel="noopener noreferrer">{copy.ctaInstall} <span className={styles.flip} aria-hidden="true">↗</span></a>
        </div>
        <p className={styles.small}>{amazon.company}</p>
        <p className={styles.small}>{copy.trademark}</p>
      </section>
    </div>
  );
}

export default function ShopifyHelpPage() {
  return <PublicShell><ShopifyHelpContent /></PublicShell>;
}
