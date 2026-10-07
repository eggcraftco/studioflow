"use client";

import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import { AMAZON_SELLER_COPY, AMAZON_SELLER_MARKETPLACES } from "@/lib/publicSite/amazonSellerCopy";
import styles from "./amazon.module.css";

const SUPPORT_EMAIL = "contact@nivadesk.co.uk";

// Display prices only; the canonical list prices are STRIPE_LIST_PRICE_LABELS
// and PLAN_ENTITLEMENTS in lib/studioflow/plans.ts. Plan names are product
// names and are not translated (Free is translated in copy.planFree).
const PLANS = [
  { id: "free", name: null, monthly: "£0", yearly: null },
  { id: "starter", name: "Starter", monthly: "£9", yearly: "£90" },
  { id: "pro", name: "Pro", monthly: "£19", yearly: "£190" },
  { id: "team", name: "Team", monthly: "£49", yearly: "£490" }
] as const;

function countryName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale, "en"], { type: "region" });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

function AmazonSellerContent() {
  const { language, locale } = usePublicSiteLanguage();
  const copy = AMAZON_SELLER_COPY[language] ?? AMAZON_SELLER_COPY.English;
  const regionTitle = { eu: copy.regionEurope, na: copy.regionNorthAmerica, fe: copy.regionFarEast } as const;
  const planNote = { free: copy.planFreeNote, starter: copy.planStarterNote, pro: copy.planProNote, team: copy.planTeamNote } as const;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="amazon-seller-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="amazon-seller-title">{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/pricing">{copy.ctaPricing}</Link>
            <Link className={styles.secondary} href="/contact">{copy.ctaContact}</Link>
          </div>
        </div>
        <aside className={styles.statusCard} aria-labelledby="amazon-status-title">
          <p className={styles.statusEyebrow} id="amazon-status-title">{copy.statusTitle}</p>
          <span className={styles.statusBadge}>{copy.statusLabel}</span>
          <p>{copy.statusBody}</p>
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="amazon-does">
        <h2 id="amazon-does">{copy.doesTitle}</h2>
        <div className={styles.featureGrid}>
          {copy.does.map(([title, body]) => (
            <article key={title} className={styles.feature}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="amazon-does-not">
        <h2 id="amazon-does-not">{copy.doesNotTitle}</h2>
        <ul className={styles.notList}>
          {copy.doesNot.map(line => <li key={line}>{line}</li>)}
        </ul>
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
        <div className={styles.regions}>
          {AMAZON_SELLER_MARKETPLACES.map(group => (
            <div key={group.region} className={styles.region}>
              <h3>{regionTitle[group.region]}</h3>
              <span className={group.region === "eu" ? styles.regionLive : styles.regionLater}>
                {group.region === "eu" ? copy.marketsSignInLive : copy.marketsSignInLater}
              </span>
              <ul>
                {group.countries.map(code => (
                  <li key={code}><span>{countryName(code, locale)}</span><span className={styles.code} dir="ltr">{code}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className={styles.note}>{copy.marketsNote}</p>
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
              <span className={styles.included}>✓ {copy.includesAmazon}</span>
            </article>
          ))}
        </div>
        <p className={styles.note}>{copy.extraSeat} {copy.pricingTrial}</p>
        <Link className={styles.textLink} href="/pricing">{copy.pricingLink} →</Link>
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
