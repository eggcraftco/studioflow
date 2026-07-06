"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseLandingCampaign, parseLandingSource, setLandingAttribution, trackLandingEvent } from "@/lib/landingTracking";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { ChatGPTAppShowcase, PublicHeader } from "@/components/PublicMarketing";

// Click-to-play demo video: only the poster image loads until the visitor
// presses play, keeping the ad landing page fast.
function LandingDemoVideo() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-demo-frame">
      {playing ? (
        <video
          className="lp-demo-video"
          src="/nivadesk-demo.mp4"
          poster="/nivadesk-demo-poster.jpg"
          controls
          autoPlay
          playsInline
          onEnded={() => trackLandingEvent("custom_order_landing_demo_complete")}
        />
      ) : (
        <button
          type="button"
          className="lp-demo-poster"
          onClick={() => {
            setPlaying(true);
            trackLandingEvent("custom_order_landing_demo_play");
          }}
          aria-label="Play the NivaDesk demo video"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nivadesk-demo-poster.jpg" alt="Preview of the NivaDesk demo video" loading="lazy" decoding="async" />
          <span className="lp-demo-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5.14v13.72L19 12z" /></svg>
          </span>
          <span className="lp-demo-duration">1:17</span>
        </button>
      )}
    </div>
  );
}

/* Standalone paid-ads landing page for NivaDesk.
   Intentionally separate from the main marketing shell: a slim header with one
   CTA (no nav links) keeps ad traffic focused on the trial sign-up. Reuses the
   public brand tokens + .public-button for visual consistency. */

type Feature = {
  title: string;
  detail: string;
  icon: "clients" | "orders" | "files" | "payments" | "team" | "progress";
};

const PROBLEM_CARDS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Orders scattered across WhatsApp, email and notes.",
    body: "Important details buried in chats and threads.",
    icon: <path d="M17 9.5c0 3-3.1 5.5-7 5.5-.8 0-1.6-.1-2.3-.3L4 16l.9-2.7C3.7 12.3 3 11 3 9.5 3 6.5 6.1 4 10 4s7 2.5 7 5.5Z" />,
  },
  {
    title: "Files, deposits and deadlines getting lost.",
    body: "Reference files, payments and dates become hard to track.",
    icon: <path d="M3 6.2a1.7 1.7 0 0 1 1.7-1.7h3.2l1.7 1.9h5.7A1.7 1.7 0 0 1 17 8.1v5.7a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 13.8V6.2Z" />,
  },
  {
    title: "Your team asking the same questions all day long.",
    body: "Repeated updates take time away from the work.",
    icon: (
      <>
        <circle cx="7.4" cy="7" r="2.6" />
        <path d="M2.8 15.6c.5-2.4 2.4-3.7 4.6-3.7 2.3 0 4.2 1.3 4.7 3.7" />
        <circle cx="14.2" cy="7.6" r="2.1" />
        <path d="M13.2 12c1.9.2 3.5 1.3 4 3.1" />
      </>
    ),
  },
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
  { icon: "orders", title: "Order status", detail: "Track each order — new, in progress, ready, delivered — at a glance." },
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
  // (full campaign tuple, no PII) so a later signup can be credited to this
  // landing page and its campaign — captured here while the URL still has the
  // utm_* params, since /signup no longer has them.
  const onStartTrialClick = () => {
    setLandingAttribution(parseLandingCampaign());
    trackLandingEvent("custom_order_landing_cta_click");
  };
  const onHowItWorksClick = () => {
    trackLandingEvent("custom_order_landing_how_it_works_click");
  };

  return (
    <div className="lp">
      <GoogleAdsTag />
      <PublicHeader hideLanguage />

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
              src="/hero-app2.webp"
              alt="NivaDesk order management workspace showing client details, files, payments and delivery progress"
              width={3456}
              height={2168}
              loading="lazy"
              decoding="async"
            />
            <figcaption>One place for client details, order status, files, payments and delivery progress.</figcaption>
          </figure>
        </section>

        {/* 1b. DEMO VIDEO */}
        <section className="lp-section lp-demo-section">
          <div className="lp-shell">
            <div className="lp-section-head">
              <span className="public-eyebrow">See it in action</span>
              <h2>Watch NivaDesk run a real order, start to finish.</h2>
              <p>
                See how NivaDesk keeps one custom order organised from first message to final delivery.
              </p>
            </div>
            <LandingDemoVideo />
          </div>
        </section>

        {/* 1c. CHATGPT APP — the LP is outside the homepage scroll-reveal
            observer, so render the shared section without the reveal class. */}
        <ChatGPTAppShowcase title="Manage orders from inside ChatGPT." revealOnScroll={false} />

        {/* 2. PROBLEM */}
        <section className="lp-section lp-section-soft">
          <div className="lp-shell">
            <div className="lp-problem-top">
              <div className="lp-section-head lp-problem-head">
                <span className="public-eyebrow lp-problem-pill">
                  <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="10" cy="10" r="7.2" />
                    <path d="M10 6.6v4M10 13.6h.01" />
                  </svg>
                  The problem
                </span>
                <h2>Running every order from your phone and memory is costing you.</h2>
                <p>
                  When each order lives in a different place, things slip. Messages get buried, deposits get
                  forgotten, and clients wait for answers.
                </p>
              </div>
              <figure className="lp-problem-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/nivadesk-problem.jpg"
                  alt="Studio owner at a desk, buried in scattered WhatsApp messages, emails, files and an overdue payment"
                  width={1146}
                  height={760}
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            </div>
            <div className="lp-problem-cards">
              {PROBLEM_CARDS.map(card => (
                <div className="lp-problem-feature" key={card.title}>
                  <span className="lp-problem-feature-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{card.icon}</svg>
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
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
              <p>Everything you need for each order, from client details and files to deposits, tasks and delivery progress, all in one place.</p>
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
