"use client";

import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import { AMAZON_SELLER_COPY, AMAZON_SELLER_MARKETPLACES_EU, type AmazonSellerCopy } from "@/lib/publicSite/amazonSellerCopy";
import styles from "./amazon.module.css";

const SUPPORT_EMAIL = "contact@nivadesk.co.uk";

// Display prices only; the canonical list prices are STRIPE_LIST_PRICE_LABELS
// and PLAN_ENTITLEMENTS in lib/studioflow/plans.ts (and PLAN_PRICES in
// components/PublicMarketing.tsx). Plan names are product names and are not
// translated (Free is translated in copy.planFree).
const PLANS = [
  { id: "free", name: null, monthly: "£0", yearly: null },
  { id: "starter", name: "Starter", monthly: "£9", yearly: "£90" },
  { id: "pro", name: "Pro", monthly: "£19", yearly: "£190" },
  { id: "team", name: "Team", monthly: "£49", yearly: "£490" }
] as const;

// The illustration's order numbers are masked on purpose: an Amazon order id
// has this shape, and no digits are shown so nothing reads as a real order.
const MASKED_ORDER = "#•••-•••••••-•••••••";

function countryName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale, "en"], { type: "region" });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

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
  <path key="cancel" d="M10 3a7 7 0 100 14 7 7 0 000-14zM5 5l10 10" />,
  <path key="link" d="M11 4h5v5M16 4l-7 7M14 12v4H4V6h4" />
];

/** The order list, drawn from the real list's parts: channel badge, item, number, status. */
function OrderListMock({ copy }: { copy: AmazonSellerCopy }) {
  const rows = [
    { channel: "Amazon", item: copy.mockItems[0], number: MASKED_ORDER, status: copy.mockStatusNew, tone: styles.toneNew },
    { channel: "Amazon", item: copy.mockItems[1], number: MASKED_ORDER, status: copy.mockStatusCancelled, tone: styles.toneCancelled },
    { channel: copy.mockManual, item: copy.mockItems[2], number: "", status: copy.mockStatusMaking, tone: styles.toneMaking, manual: true }
  ];
  return (
    <figure className={styles.mockFigure}>
      <div className={styles.mockWindow} role="img" aria-label={copy.mockLabel}>
        <div className={styles.mockBar} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.mockHead} aria-hidden="true">
          <strong>{copy.mockOrdersTitle}</strong>
        </div>
        <ul className={styles.mockRows} aria-hidden="true">
          {rows.map(row => (
            <li key={row.item} className={styles.mockRow}>
              <span className={row.manual ? styles.badgeManual : styles.badgeAmazon}>{row.channel}</span>
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

/** The Amazon strip an imported order carries (app/orders/OrderDetailContent.tsx channel strip). */
function OrderStripMock({ copy }: { copy: AmazonSellerCopy }) {
  return (
    <figure className={styles.stripFigure}>
      <div className={styles.stripCard} role="img" aria-label={copy.mockLabel}>
        <div className={styles.stripTitle} aria-hidden="true">
          <b>{copy.mockItems[0]}</b>
          <span className={`${styles.mockStatus} ${styles.toneMaking}`}>{copy.mockProduction}: {copy.mockStatusMaking}</span>
        </div>
        <div className={styles.strip} aria-hidden="true">
          <span className={styles.badgeAmazon}>Amazon</span>
          <span dir="ltr">{MASKED_ORDER}</span>
          <span>{copy.mockPlatformStatus}: <span dir="ltr">unshipped</span></span>
          <span>{copy.mockPayment}: <span dir="ltr">paid</span></span>
          <span className={styles.stripLink}>{copy.mockOpen} <span className={styles.flip}>↗</span></span>
        </div>
        <div className={styles.stripCustomer} aria-hidden="true">Amazon Customer</div>
      </div>
      <figcaption className={styles.mockCaption}>{copy.mockCaption}</figcaption>
    </figure>
  );
}

function AmazonSellerContent() {
  const { language, locale } = usePublicSiteLanguage();
  const copy = AMAZON_SELLER_COPY[language] ?? AMAZON_SELLER_COPY.English;
  const planNote = { free: copy.planFreeNote, starter: copy.planStarterNote, pro: copy.planProNote, team: copy.planTeamNote } as const;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="amazon-seller-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="amazon-seller-title">{copy.heroTitle}</h1>
          <p className={styles.intro}>{copy.heroIntro}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/signup">{copy.ctaStart}</Link>
            <Link className={styles.secondary} href="/pricing">{copy.ctaPricing}</Link>
          </div>
          <ul className={styles.heroFacts}>
            {copy.heroFacts.map(fact => <li key={fact}><Check />{fact}</li>)}
          </ul>
        </div>
        <OrderListMock copy={copy} />
      </section>

      <section className={styles.statusBand} aria-labelledby="amazon-status-title">
        <div className={styles.statusInner}>
          <div className={styles.statusHead}>
            <p className={styles.statusEyebrow} id="amazon-status-title">{copy.statusTitle}</p>
            <span className={styles.statusBadge}><span className={styles.statusDot} aria-hidden="true" />{copy.statusLabel}</span>
          </div>
          <p>{copy.statusBody}</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="amazon-jobs">
        <h2 id="amazon-jobs">{copy.jobsTitle}</h2>
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

      <section className={styles.section} aria-labelledby="amazon-fields">
        <h2 id="amazon-fields">{copy.fieldsTitle}</h2>
        <p className={styles.lead}>{copy.fieldsIntro}</p>
        <div className={styles.fieldGrid}>
          <div className={styles.fieldCol}>
            <h3>{copy.fieldsOrderTitle}</h3>
            <ul>{copy.fieldsOrder.map(line => <li key={line}><Check />{line}</li>)}</ul>
          </div>
          <div className={styles.fieldCol}>
            <h3>{copy.fieldsItemTitle}</h3>
            <ul>{copy.fieldsItem.map(line => <li key={line}><Check />{line}</li>)}</ul>
          </div>
          <div className={`${styles.fieldCol} ${styles.fieldColNot}`}>
            <h3>{copy.fieldsNotTitle}</h3>
            <ul>{copy.fieldsNot.map(line => <li key={line}><Cross />{line}</li>)}</ul>
          </div>
        </div>
        <div className={styles.shownRow}>
          <p className={styles.shownText}>{copy.fieldsShown}</p>
          <OrderStripMock copy={copy} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="amazon-sync">
        <h2 id="amazon-sync">{copy.syncTitle}</h2>
        <p className={styles.lead}>{copy.syncIntro}</p>
        <ol className={styles.flow}>
          {copy.syncNodes.map(([title, body], index) => (
            <li key={title} className={styles.flowStep}>
              <div className={index === 1 ? `${styles.flowNode} ${styles.flowNodeMid}` : styles.flowNode}>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
              {index < 2 ? (
                <div className={styles.flowArrow}>
                  <span className={styles.flowArrowLine} aria-hidden="true" />
                  <span className={styles.flowArrowLabel}>{index === 0 ? copy.syncArrowRead : copy.syncArrowSend}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <dl className={styles.factGrid}>
          {copy.syncFacts.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="amazon-direction">
        <h2 id="amazon-direction">{copy.directionTitle}</h2>
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
      </section>

      <section className={styles.section} aria-labelledby="amazon-connect">
        <h2 id="amazon-connect">{copy.connectTitle}</h2>
        <ol className={styles.steps}>
          {copy.connectSteps.map(([title, body], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
        <p className={styles.note}>{copy.connectDisconnect}</p>
        <p className={styles.note}>{copy.connectAppstore}</p>
      </section>

      <section className={styles.section} aria-labelledby="amazon-markets">
        <h2 id="amazon-markets">{copy.marketsTitle}</h2>
        <p className={styles.lead}>{copy.marketsIntro}</p>
        <div className={styles.region}>
          <div className={styles.regionHead}>
            <h3>{copy.regionEurope}</h3>
            <span className={styles.regionLive}>{copy.marketsSignInLive}</span>
          </div>
          <ul className={styles.countries}>
            {AMAZON_SELLER_MARKETPLACES_EU.map(code => (
              <li key={code}><span>{countryName(code, locale)}</span><span className={styles.code} dir="ltr">{code}</span></li>
            ))}
          </ul>
        </div>
        <p className={styles.note}>{copy.marketsNote}</p>
      </section>

      <section className={styles.section} aria-labelledby="amazon-limits">
        <h2 id="amazon-limits">{copy.limitsTitle}</h2>
        <dl className={styles.limitList}>
          {copy.limits.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="amazon-pricing">
        <h2 id="amazon-pricing">{copy.pricingTitle}</h2>
        <p className={styles.lead}>{copy.pricingIntro}</p>
        <div className={styles.plans}>
          {PLANS.map(plan => (
            <article key={plan.id} className={styles.plan}>
              <h3>{plan.name ?? copy.planFree}</h3>
              <p className={styles.price}>
                <span dir="ltr">{plan.monthly}</span> <small>{copy.perMonth}</small>
              </p>
              {plan.yearly ? <p className={styles.priceYear}><span dir="ltr">{plan.yearly}</span> {copy.perYear}</p> : <p className={styles.priceYear}>&nbsp;</p>}
              <p className={styles.planNote}>{planNote[plan.id]}</p>
              <span className={styles.included}><Check />{copy.includesAmazon}</span>
            </article>
          ))}
        </div>
        <p className={styles.note}>{copy.extraSeat} {copy.pricingTrial}</p>
        <Link className={styles.textLink} href="/pricing">{copy.pricingLink} <span className={styles.flip}>→</span></Link>
      </section>

      <section className={styles.section} aria-labelledby="amazon-data">
        <h2 id="amazon-data">{copy.dataTitle}</h2>
        <dl className={styles.dataList}>
          {copy.data.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
        <h3 className={styles.subhead}>{copy.legalTitle}</h3>
        <ul className={styles.links}>
          <li><Link href="/privacy">{copy.linkPrivacy}</Link></li>
          <li><Link href="/terms">{copy.linkTerms}</Link></li>
          <li><Link href="/security">{copy.linkSecurity}</Link></li>
          <li><Link href="/subprocessors">{copy.linkSubprocessors}</Link></li>
          <li><Link href="/account-deletion">{copy.linkDeletion}</Link></li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="amazon-faq">
        <h2 id="amazon-faq">{copy.faqTitle}</h2>
        <div className={styles.faq}>
          {copy.faq.map(([question, answer]) => (
            <details key={question} className={styles.faqItem}>
              <summary><span>{question}</span><span className={styles.faqMark} aria-hidden="true">+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.contact}`} aria-labelledby="amazon-contact">
        <h2 id="amazon-contact">{copy.contactTitle}</h2>
        <p className={styles.lead}>{copy.contactBody}</p>
        <p className={styles.contactLine}>
          {copy.contactEmailLabel}: <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">{SUPPORT_EMAIL}</a>
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/contact">{copy.contactPage}</Link>
        </div>
        <p className={styles.small}>{copy.company}</p>
        <p className={styles.small}>{copy.trademark}</p>
      </section>
    </div>
  );
}

export default function AmazonSellerPage() {
  return <PublicShell><AmazonSellerContent /></PublicShell>;
}
