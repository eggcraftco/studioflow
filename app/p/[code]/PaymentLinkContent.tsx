"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { PaymentReturnLanguage } from "@/lib/publicSite/paymentReturn";
import {
  PAYMENT_LINK_COPY,
  paymentLinkAmount,
  paymentPageTheme,
  type PaymentLinkStatus,
  type PaymentLinkView
} from "@/lib/publicSite/paymentLink";
import styles from "./payLink.module.css";

// Exactly what the server chose to send: the business's name and logo, the order's reference, the
// amount and the link's state. No order, customer or Stripe id reaches this page, and the Stripe URL
// itself is only ever handed over when the customer presses Pay — it is fetched fresh then, because
// Stripe's session lasts 24 hours and this link does not.

type Failure = "" | "failed" | "tooMany";

function failureOf(error: unknown): Failure | "unavailable" {
  const code = String((error as { code?: string })?.code || "");
  if (/not-found|permission-denied|invalid-argument/.test(code)) return "unavailable";
  if (/resource-exhausted/.test(code)) return "tooMany";
  return "failed";
}

function readableOn(accent: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return "#ffffff";
  const r = parseInt(accent.slice(1, 3), 16), g = parseInt(accent.slice(3, 5), 16), b = parseInt(accent.slice(5, 7), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? "#1c2430" : "#ffffff";
}

export function PaymentLinkContent({
  code,
  language,
  direction,
  fontClassName = ""
}: {
  code: string;
  language: PaymentReturnLanguage;
  direction: "rtl" | "ltr";
  /** next/font's variable class for the optional theme font (Poppins), not preloaded. */
  fontClassName?: string;
}) {
  const copy = PAYMENT_LINK_COPY[language];
  const [view, setView] = useState<PaymentLinkView | null>(null);
  const [status, setStatus] = useState<PaymentLinkStatus | "loading">(code ? "loading" : "unavailable");
  const [failure, setFailure] = useState<Failure>("");
  const [opening, setOpening] = useState(false);

  const host = () => (typeof window !== "undefined" ? window.location.host : "");

  const load = useCallback(async () => {
    if (!code) return;
    setStatus("loading");
    setFailure("");
    try {
      const callable = httpsCallable<{ code: string; host: string }, { ok?: boolean; link?: PaymentLinkView }>(
        functions,
        "getPaymentLinkForVisitor"
      );
      const result = await callable({ code, host: host() });
      if (!result.data?.link) throw Object.assign(new Error("not-found"), { code: "functions/not-found" });
      setView(result.data.link);
      setStatus(result.data.link.status);
    } catch (error) {
      const kind = failureOf(error);
      if (kind === "unavailable") {
        setStatus("unavailable");
      } else {
        setStatus("unavailable");
        setFailure(kind);
      }
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  // The tab wears the business's name and logo, as the tracking page does: on pay.<their domain>
  // a NivaDesk favicon is exactly the mismatch the domain exists to remove.
  useEffect(() => {
    if (!view || typeof document === "undefined") return;
    const name = view.businessName.trim();
    document.title = name ? `${name} — ${copy.title}` : copy.title;
    const logo = view.logoUrl.trim();
    if (!logo) return;
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
    link.href = logo;
  }, [view, copy.title]);

  async function pay() {
    if (!code || opening) return;
    setOpening(true);
    setFailure("");
    try {
      const callable = httpsCallable<{ code: string; host: string }, { ok?: boolean; status?: PaymentLinkStatus; url?: string }>(
        functions,
        "openPaymentLink"
      );
      const result = await callable({ code, host: host() });
      const url = String(result.data?.url || "");
      if (result.data?.status === "open" && /^https:\/\//.test(url)) {
        // Leaving for Stripe: the button stays in its "opening" state until the browser goes.
        window.location.assign(url);
        return;
      }
      setStatus(result.data?.status && result.data.status !== "open" ? result.data.status : "unavailable");
      setOpening(false);
    } catch (error) {
      const kind = failureOf(error);
      if (kind === "unavailable") setStatus("unavailable");
      else setFailure(kind);
      setOpening(false);
    }
  }

  // The business's own look, when it has one (companySettings.paymentPageTheme); otherwise the neutral card.
  const theme = paymentPageTheme(view?.theme);
  const accent = theme?.buttonColor || (view?.accentColor && /^#[0-9a-f]{6}$/i.test(view.accentColor) ? view.accentColor : "#2563eb");
  const buttonStyle = {
    "--pay-accent": accent,
    "--pay-on-accent": theme?.buttonColor ? theme.buttonTextColor : readableOn(accent)
  } as CSSProperties;
  const themeStyle = theme
    ? ({
        ...(theme.pageBackground ? { "--pay-bg": theme.pageBackground } : {}),
        ...(theme.textColor ? { "--pay-text": theme.textColor } : {}),
        ...(theme.mutedColor ? { "--pay-muted": theme.mutedColor } : {})
      } as CSSProperties)
    : undefined;
  const pageClass = [
    styles.page,
    fontClassName,
    theme ? styles.themed : "",
    theme?.font === "poppins" ? styles.poppins : "",
    theme?.titleFont === "serif" ? styles.serifTitle : ""
  ].filter(Boolean).join(" ");
  const buttonClass = [styles.pay, theme?.buttonShape === "pill" ? styles.pill : "", theme?.buttonUppercase ? styles.upper : ""].filter(Boolean).join(" ");
  const productLayout = theme?.layout === "product";

  const closed: Record<Exclude<PaymentLinkStatus, "open">, { title: string; body: string; mark: string; tone: string }> = {
    paid: { title: copy.paidTitle, body: copy.paidBody, mark: "✓", tone: styles.paid },
    processing: { title: copy.processingTitle, body: copy.processingBody, mark: "…", tone: styles.info },
    cancelled: { title: copy.cancelledTitle, body: copy.cancelledBody, mark: "×", tone: styles.stopped },
    closed: { title: copy.closedTitle, body: copy.closedBody, mark: "i", tone: styles.info },
    unavailable: { title: copy.unavailableTitle, body: copy.unavailableBody, mark: "i", tone: styles.info }
  };

  return (
    <main className={pageClass} style={themeStyle} lang={language} dir={direction} data-status={status} data-themed={theme ? "true" : undefined}>
      {productLayout && view?.logoUrl ? (
        // The shop's own header: its logo on a thin bar, as on its website.
        <header className={styles.siteBar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.logoUrl} alt={view.businessName || ""} />
        </header>
      ) : null}
      <div className={productLayout ? styles.product : styles.single}>
      {productLayout && theme?.heroImageUrl ? (
        <div className={`${styles.hero} ${theme.heroImageFocus === "top" ? styles.heroTop : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.heroImageUrl} alt="" />
        </div>
      ) : null}
      <section className={productLayout ? styles.details : styles.card}>
        {view && !(productLayout && view.logoUrl) && (view.logoUrl || view.businessName) ? (
          <header className={styles.brand}>
            {view.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.logoUrl} alt="" className={styles.logo} />
            ) : null}
            {view.businessName ? <strong className={styles.business}>{view.businessName}</strong> : null}
          </header>
        ) : null}

        {status === "loading" ? (
          <p className={styles.muted}>{copy.loading}</p>
        ) : status === "open" && view ? (
          <>
            <h1>{copy.title}</h1>
            {view.reference ? <p className={styles.muted}>{copy.forOrder.replace("{reference}", view.reference)}</p> : null}
            <div className={styles.amountBox}>
              <span className={styles.amountLabel}>{copy.amount}</span>
              <strong className={styles.amount}>{paymentLinkAmount(view.amountMinor, view.currency, language)}</strong>
            </div>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={opening} onClick={() => void pay()}>
              {opening ? copy.opening : copy.pay}
            </button>
            {failure ? (
              <p role="alert" className={styles.alert}>{failure === "tooMany" ? copy.tooMany : copy.failed}</p>
            ) : null}
            <p className={styles.secure}>
              <span aria-hidden="true">🔒 </span>{copy.secure}
            </p>
          </>
        ) : (
          (() => {
            // A read that failed is not a link that is gone: it says so, and offers to try again.
            const readFailed = Boolean(failure) && !view;
            const state = readFailed
              ? { title: copy.title, body: failure === "tooMany" ? copy.tooMany : copy.failed, mark: "!", tone: styles.info }
              : closed[(status === "open" ? "unavailable" : status) as Exclude<PaymentLinkStatus, "open">];
            return (
              <>
                <span className={`${styles.mark} ${state.tone}`} aria-hidden="true">{state.mark}</span>
                <h1>{state.title}</h1>
                <p role={readFailed ? "alert" : undefined}>{state.body}</p>
                {readFailed ? (
                  <button type="button" className={styles.retry} onClick={() => void load()}>{copy.retry}</button>
                ) : null}
              </>
            );
          })()
        )}

        {view?.showPoweredBy !== false ? <p className={styles.powered}>{copy.poweredBy}</p> : null}
      </section>
      </div>
    </main>
  );
}
