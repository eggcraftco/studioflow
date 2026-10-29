import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  PAYMENT_RETURN_COPY,
  paymentReturnDirection,
  paymentReturnLanguage,
  paymentReturnStatus
} from "@/lib/publicSite/paymentReturn";
import styles from "./pay.module.css";

// Where Stripe sends a business's customer after its hosted payment page
// (functions/paymentConnect.js `customerReturnUrl`). The customer has no
// NivaDesk account, so this is outside the app shell and needs no sign-in;
// it is never indexed and never listed. It is rendered on the server in the
// visitor's own language, and it shows nothing about the workspace or the
// order: the address carries only `?status=`, which proves nothing — the
// payment reaches the order through Stripe's signed webhook.
export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

export default async function PaymentDonePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = paymentReturnStatus(params.status);
  const language = paymentReturnLanguage((await headers()).get("accept-language"));
  const copy = PAYMENT_RETURN_COPY[language];
  const title = status === "paid" ? copy.paidTitle : status === "cancelled" ? copy.cancelledTitle : copy.unknownTitle;
  const body = status === "paid" ? copy.paidBody : status === "cancelled" ? copy.cancelledBody : copy.unknownBody;
  return (
    <main className={styles.page} lang={language} dir={paymentReturnDirection(language)} data-status={status}>
      <section className={styles.card}>
        <span className={`${styles.mark} ${styles[status]}`} aria-hidden="true">
          {status === "paid" ? "✓" : status === "cancelled" ? "×" : "i"}
        </span>
        <h1>{title}</h1>
        <p>{body}</p>
        <p className={styles.close}>{copy.close}</p>
        <p className={styles.secure}>{copy.secure}</p>
      </section>
    </main>
  );
}
