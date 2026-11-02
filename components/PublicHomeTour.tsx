"use client";

// The homepage tour (2 Nov 2026): seven short, silent recordings of the Mac app
// working on a made-up leather studio (no real customers, shops or money), one
// per step of an order's life. Steps on one side, the video on the other; the
// video plays while the section is on screen and moves on to the next step when
// it ends. Files live in public/tour/<id>.{mp4,jpg}, 1600×1000 (H.264 plays
// everywhere; a VP9 WebM came out larger for this kind of screen recording).
//
// Nothing loads until the section is close to the viewport, and a visitor who
// asked for reduced motion gets the poster and a play button instead of a
// video that starts by itself (and no automatic step change). The pause button
// is always there: anything that moves for more than five seconds must be
// stoppable.

import { useEffect, useRef, useState } from "react";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import type { PublicSiteTranslationKey } from "@/lib/publicSite/translations";

const TOUR_STEPS: { id: string; titleKey: PublicSiteTranslationKey; bodyKey: PublicSiteTranslationKey }[] = [
  { id: "new-order", titleKey: "tour.order.title", bodyKey: "tour.order.body" },
  { id: "store-orders", titleKey: "tour.shops.title", bodyKey: "tour.shops.body" },
  { id: "production", titleKey: "tour.production.title", bodyKey: "tour.production.body" },
  { id: "calendar", titleKey: "tour.calendar.title", bodyKey: "tour.calendar.body" },
  { id: "payment", titleKey: "tour.payment.title", bodyKey: "tour.payment.body" },
  { id: "shipping", titleKey: "tour.shipping.title", bodyKey: "tour.shipping.body" },
  { id: "estimate", titleKey: "tour.estimate.title", bodyKey: "tour.estimate.body" }
];

export function PublicHomeTour() {
  const { t } = usePublicSiteLanguage();
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(0);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  // The visitor's own pause. Starts paused for reduced motion (set below).
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setPaused(true);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setInView(true);
      return;
    }
    const nearObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setNear(true);
    }, { rootMargin: "400px 0px" });
    const viewObserver = new IntersectionObserver(entries => {
      for (const entry of entries) setInView(entry.isIntersecting);
    }, { threshold: 0.35 });
    nearObserver.observe(node);
    viewObserver.observe(node);
    return () => {
      nearObserver.disconnect();
      viewObserver.disconnect();
    };
  }, []);

  // One place decides whether the current video runs: on screen, loaded, and not
  // paused by the visitor. A new step remounts the <video> (key), so this runs
  // again for it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near) return;
    if (inView && !paused) {
      // Only a refusal (autoplay blocked, e.g. low-power mode) shows the play
      // button; an AbortError just means a pause or a new step came first.
      video.play().catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name === "NotAllowedError") setPaused(true);
      });
    } else {
      video.pause();
    }
  }, [active, near, inView, paused]);

  const choose = (index: number) => {
    setActive(index);
    setProgress(0);
    if (!reduced) setPaused(false);
  };

  const step = TOUR_STEPS[active];

  return (
    <section ref={sectionRef} className="public-section public-tour-section public-scroll-reveal" id="how-it-works">
      <div className="public-shell">
        <div className="public-section-header">
          <span className="public-eyebrow">{t("tour.eyebrow")}</span>
          <h2>{t("tour.title")}</h2>
          <p>{t("tour.body")}</p>
        </div>
        <div className="public-tour-layout">
          <ol className="public-tour-steps">
            {TOUR_STEPS.map((item, index) => {
              const current = index === active;
              return (
                <li key={item.id} className="public-tour-step">
                  <button
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => choose(index)}
                  >
                    <span className="public-tour-num" aria-hidden="true">{index + 1}</span>
                    <strong>{t(item.titleKey)}</strong>
                    {current ? <span className="public-tour-step-body">{t(item.bodyKey)}</span> : null}
                    {current ? (
                      <span className="public-tour-progress" aria-hidden="true">
                        <span style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="public-tour-stage" data-paused={paused ? "true" : "false"}>
            <video
              key={step.id}
              ref={videoRef}
              className="public-tour-video"
              poster={`/tour/${step.id}.jpg`}
              // A src attribute, not a <source> child: a <source> added after
              // mount does not always start loading (seen on phones).
              src={near ? `/tour/${step.id}.mp4` : undefined}
              muted
              playsInline
              preload={near ? "auto" : "none"}
              aria-label={t(step.titleKey)}
              onTimeUpdate={event => {
                const video = event.currentTarget;
                if (video.duration > 0) setProgress(video.currentTime / video.duration);
              }}
              onEnded={() => {
                if (reduced) {
                  setPaused(true);
                  return;
                }
                setActive(index => (index + 1) % TOUR_STEPS.length);
                setProgress(0);
              }}
            />
            <button
              type="button"
              className="public-tour-toggle"
              aria-label={paused ? t("tour.play") : t("tour.pause")}
              onClick={() => setPaused(value => !value)}
            >
              {paused ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
