"use client";

// One recording from the homepage tour (components/PublicHomeTour.tsx), shown on
// its own on a help page (7 Nov 2026: the Shopify page shows the shop-orders
// clip). Same files (public/tour/<id>.{mp4,jpg}, 1600×1000, made-up studio, no
// real customers), same rules as the tour:
// - nothing loads until the clip is close to the viewport;
// - it plays only while on screen and loops;
// - the pause button is always there (anything that moves for more than five
//   seconds must be stoppable);
// - a visitor who asked for reduced motion gets the poster and a play button,
//   and the clip stops at its end instead of looping.
// The caption is the tour's own text for that step, already in all 12 languages.

import { useEffect, useRef, useState } from "react";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import type { PublicSiteTranslationKey } from "@/lib/publicSite/translations";

export function PublicClip({ id, titleKey, bodyKey, className, captionClassName }: {
  id: string;
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  className?: string;
  captionClassName?: string;
}) {
  const { t } = usePublicSiteLanguage();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);

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
    const node = stageRef.current;
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near) return;
    if (inView && !paused) {
      video.play().catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name === "NotAllowedError") setPaused(true);
      });
    } else {
      video.pause();
    }
  }, [near, inView, paused]);

  return (
    <figure className={className}>
      <div ref={stageRef} className="public-tour-stage" data-paused={paused ? "true" : "false"}>
        <video
          ref={videoRef}
          className="public-tour-video"
          poster={`/tour/${id}.jpg`}
          src={near ? `/tour/${id}.mp4` : undefined}
          muted
          playsInline
          loop={!reduced}
          preload={near ? "auto" : "none"}
          aria-label={t(titleKey)}
          onEnded={() => setPaused(true)}
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
      <figcaption className={captionClassName}><strong>{t(titleKey)}</strong> {t(bodyKey)}</figcaption>
    </figure>
  );
}
