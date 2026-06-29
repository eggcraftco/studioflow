"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { parseLandingSource, setLandingAttribution, trackLandingEvent } from "@/lib/landingTracking";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";

/* Standalone paid-ads landing page for NivaDesk.
   Intentionally separate from the main marketing shell: a slim header with one
   CTA (no nav links) keeps ad traffic focused on the trial sign-up. Reuses the
   public brand tokens + .public-button for visual consistency. */

type Feature = {
  title: string;
  detail: string;
  icon: "clients" | "orders" | "files" | "payments" | "team" | "progress";
};

const PROBLEMS: string[] = [
  "Orders scattered across WhatsApp chats, email threads and sticky notes.",
  "Deposits and balances you have to chase from memory.",
  "Design files and photos lost in phone galleries and random folders.",
  "No clear view of what's due, what's paid and what's running late.",
  "Your team asking you the same questions all day long."
];

const BEFORE_ITEMS: string[] = [
  "WhatsApp messages and missed replies",
  "Spreadsheets that fall out of date",
  "Reference files spread across phones and folders",
  "Payment notes you keep in your head",
  "Your team asking you for updates all day"
];

const AFTER_ITEMS: string[] = [
  "One client record per customer",
  "One clear timeline for every order",
  "All reference files kept on the order",
  "Deposits and balances tracked for you",
  "Team tasks and delivery progress in one view"
];

const FEATURES: Feature[] = [
  { icon: "clients", title: "Customer details", detail: "Contact details, order notes and full history in one client record." },
  { icon: "orders", title: "Job status", detail: "Track each order — new, in progress, ready, delivered — at a glance." },
  { icon: "files", title: "Reference files", detail: "Designs, photos and reference files kept on the right order." },
  { icon: "payments", title: "Deposits & payments", detail: "Log deposits and payments per order. Always know what's owed." },
  { icon: "team", title: "Team tasks", detail: "Assign team tasks and see what's done — without chasing." },
  { icon: "progress", title: "Delivery progress", detail: "See what's due, what's late and what's ready to hand over." }
];

const STEPS: { title: string; detail: string }[] = [
  { title: "A new order comes in", detail: "Add the client and order details in seconds — no spreadsheet, no scrolling back through chats." },
  { title: "Drop in the files", detail: "Attach designs, photos and measurements straight to the order so everything lives in one place." },
  { title: "Record the deposit", detail: "Log what's been paid. NivaDesk keeps the balance and payment history up to date for you." },
  { title: "Move it through your stages", detail: "Update the order from in progress to ready to delivered, so you always know where it stands." },
  { title: "Your team picks up tasks", detail: "Assign the work and let your team update progress as they go — without asking you first." },
  { title: "Delivered and paid in full", detail: "Close the order with the full history saved, ready for the next time that client comes back." }
];

const AUDIENCES: { title: string; detail: string }[] = [
  { title: "Custom & bespoke makers", detail: "Furniture, signage, cakes, apparel, jewellery — anything built to order." },
  { title: "Small workshops & studios", detail: "Print shops, framers, ceramics, woodwork and maker studios." },
  { title: "Repair & service businesses", detail: "Repairs, alterations, installs and made-to-order service jobs." },
  { title: "Creative studios & freelancers", detail: "Design, branding and creative work delivered project by project." }
];

function FeatureIcon({ icon }: { icon: Feature["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 22,
    height: 22,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  switch (icon) {
    case "clients":
      return (<svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" /></svg>);
    case "orders":
      return (<svg {...common}><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5v2.5h6V3.5M9 11h6M9 15h4" /></svg>);
    case "files":
      return (<svg {...common}><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.3A1.5 1.5 0 0 1 19 19.5H5.5A1.5 1.5 0 0 1 4 18V7.5Z" /></svg>);
    case "payments":
      return (<svg {...common}><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10h17M7 14.5h3" /></svg>);
    case "team":
      return (<svg {...common}><circle cx="9" cy="9" r="3" /><path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" /><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .6 3.5 2.2 3.5 4.6" /></svg>);
    case "progress":
      return (<svg {...common}><path d="M4 19V5M4 19h16" /><path d="M8 16l3.5-4 3 2.5L20 8" /></svg>);
  }
}

export function CustomOrderLanding() {
  const sourceRef = useRef<string>("direct");

  // Landing page view + traffic source (anonymous, aggregate-only).
  useEffect(() => {
    const source = parseLandingSource();
    sourceRef.current = source;
    trackLandingEvent("custom_order_landing_view", source);
  }, []);

  // Every "Start Free Trial" click is tracked and stamps an attribution marker
  // (source only) so a later signup can be credited to this landing page.
  const onStartTrialClick = () => {
    setLandingAttribution(sourceRef.current);
    trackLandingEvent("custom_order_landing_cta_click");
  };
  const onHowItWorksClick = () => {
    trackLandingEvent("custom_order_landing_how_it_works_click");
  };

  return (
    <div className="lp">
      <GoogleAdsTag />
      <header className="lp-header">
        <div className="lp-shell lp-header-inner">
          <Link href="/" className="lp-brand" aria-label="NivaDesk home">
            <img className="lp-brand-logo" src="/brand/nivadesk-logo.png" alt="NivaDesk" />
          </Link>
          <Link href="/signup" className="public-button" onClick={onStartTrialClick}>Start Free Trial</Link>
        </div>
      </header>

      <main>
        {/* 1. HERO */}
        <section className="lp-hero">
          <div className="lp-shell lp-hero-inner">
            <span className="public-eyebrow lp-hero-eyebrow">For small custom-order businesses</span>
            <h1 className="lp-hero-title">Stop losing client orders in WhatsApp, spreadsheets and folders.</h1>
            <p className="lp-hero-lede">
              NivaDesk helps small custom-order businesses manage clients, orders, files, payments and team tasks in one calm workspace.
            </p>
            <div className="lp-cta-row">
              <Link href="/signup" className="public-button large" onClick={onStartTrialClick}>Start Free Trial</Link>
              <a href="#how-it-works" className="public-button large ghost" onClick={onHowItWorksClick}>See How It Works</a>
            </div>
            <p className="lp-hero-trust">No credit card required. Set up your first order in minutes.</p>
          </div>
          <figure className="lp-hero-shot">
            <img
              className="lp-hero-shot-img"
              src="/hero-app.webp"
              alt="NivaDesk order management workspace showing client details, files, payments and delivery progress"
              width={3744}
              height={2612}
              loading="lazy"
              decoding="async"
            />
            <figcaption>One place for client details, order status, files, payments and delivery progress.</figcaption>
          </figure>
        </section>

        {/* 2. PROBLEM */}
        <section className="lp-section lp-section-soft">
          <div className="lp-shell">
            <div className="lp-section-head">
              <span className="public-eyebrow">The problem</span>
              <h2>Running every order from your phone and memory is costing you.</h2>
              <p>
                When each order lives in a different place, things slip. A message gets buried. A deposit gets forgotten.
                A client asks for an update and you can&apos;t find the answer.
              </p>
            </div>
            <div className="lp-problem-grid">
              {PROBLEMS.map(problem => (
                <div className="lp-problem-card" key={problem}>
                  <span className="lp-problem-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M7 7l10 10M17 7L7 17" />
                    </svg>
                  </span>
                  <p>{problem}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. BEFORE / AFTER */}
        <section className="lp-section">
          <div className="lp-shell">
            <div className="lp-section-head center">
              <span className="public-eyebrow">The fix</span>
              <h2>From scattered to one calm workspace.</h2>
              <p>Same orders. Far less chaos.</p>
            </div>
            <div className="lp-beforeafter">
              <div className="lp-ba-card lp-ba-before">
                <span className="lp-ba-tag">Before NivaDesk</span>
                <ul>
                  {BEFORE_ITEMS.map(item => (
                    <li key={item}>
                      <span className="lp-ba-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lp-ba-card lp-ba-after">
                <span className="lp-ba-tag">After NivaDesk</span>
                <ul>
                  {AFTER_ITEMS.map(item => (
                    <li key={item}>
                      <span className="lp-ba-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10" /></svg>
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="lp-midcta">
              <p>Everything for one order — details, files, deposits and tasks — in one place.</p>
              <Link href="/signup" className="public-button large" onClick={onStartTrialClick}>Start Free Trial</Link>
            </div>
          </div>
        </section>

        {/* 4. KEY FEATURES */}
        <section className="lp-section lp-section-soft">
          <div className="lp-shell">
            <div className="lp-section-head center">
              <span className="public-eyebrow">What you get</span>
              <h2>Everything a custom-order business needs to stay on top of work.</h2>
              <p>Six simple tools that replace the spreadsheets, chats and folders you use today.</p>
            </div>
            <div className="lp-feature-grid">
              {FEATURES.map(feature => (
                <article className="lp-feature-card" key={feature.title}>
                  <span className="lp-feature-icon"><FeatureIcon icon={feature.icon} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. EXAMPLE WORKFLOW */}
        <section className="lp-section" id="how-it-works">
          <div className="lp-shell">
            <div className="lp-section-head center">
              <span className="public-eyebrow">How it works</span>
              <h2>Follow one order from first message to delivered.</h2>
              <p>This is how a single custom order flows through NivaDesk — calm and in order, every time.</p>
            </div>
            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <li className="lp-step" key={step.title}>
                  <span className="lp-step-num" aria-hidden="true">{index + 1}</span>
                  <div className="lp-step-body">
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6. WHO IT'S FOR */}
        <section className="lp-section lp-section-soft">
          <div className="lp-shell">
            <div className="lp-section-head center">
              <span className="public-eyebrow">Who it&apos;s for</span>
              <h2>Made for businesses that build to order.</h2>
            </div>
            <div className="lp-audience-grid">
              {AUDIENCES.map(audience => (
                <article className="lp-audience-card" key={audience.title}>
                  <h3>{audience.title}</h3>
                  <p>{audience.detail}</p>
                </article>
              ))}
            </div>
            <p className="lp-audience-note">
              If you&apos;re running orders through WhatsApp, email, spreadsheets and folders today, NivaDesk is built for you.
            </p>
          </div>
        </section>

        {/* 7. FINAL CTA */}
        <section className="lp-final">
          <div className="lp-shell lp-final-inner">
            <h2>Bring every order into one calm workspace.</h2>
            <p>
              Set up your first client and order in a few minutes. Keep customer details, files, deposits,
              tasks and delivery progress together — and start for free.
            </p>
            <div className="lp-cta-row center">
              <Link href="/signup" className="public-button large" onClick={onStartTrialClick}>Start Free Trial</Link>
            </div>
            <p className="lp-hero-trust">Built for small studios, workshops and service businesses.</p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <img className="lp-footer-logo" src="/brand/nivadesk-logo.png" alt="NivaDesk" />
          <nav className="lp-footer-links" aria-label="Footer">
            <Link href="/">Home</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:contact@nivadesk.co.uk">Contact</a>
          </nav>
          <span className="lp-footer-legal">© EGGCRAFT LIMITED · Registered in England and Wales No. 16566512</span>
        </div>
      </footer>
    </div>
  );
}
