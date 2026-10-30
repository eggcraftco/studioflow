"use client";

import { useEffect, useState } from "react";
import { paymentLinksAccess, paymentLinksAvailable } from "@/lib/studioflow/stripeConnect";

/**
 * `true` once the server has said this workspace may use Payment Links;
 * `false` when it said no (outside the pilot, rail off) or could not be asked;
 * `null` while the answer is on its way — and while there is no workspace yet.
 * Every Payment Links surface renders nothing unless this is exactly `true`.
 *
 * "No workspace yet" is null, not false: the pages mount before their workspace
 * has loaded, and a "no" for the empty id sent Banking's ?tab=payment-links back
 * to the overview for the pilot workspace itself (found in the S2 screens).
 */
export function usePaymentLinksAvailable(companyId: string): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    setAvailable(null);
    const id = String(companyId || "").trim();
    if (!id) return () => { active = false; };
    void paymentLinksAvailable(id).then((value) => { if (active) setAvailable(value); });
    return () => { active = false; };
  }, [companyId]);
  return available;
}

/**
 * SL-23 (30 Oct 2026): the plan's answer from the SAME read as `usePaymentLinksAvailable` (one call per
 * workspace per page). `false` only when the server said the plan does not include Stripe payments (Free);
 * `true` only when it said it does; `null` while asking, when the read failed, and from a server older than
 * the plan gate. A "New payment link" button hides on exactly `false`; the order-less link shows on exactly
 * `true` (it ships in the same server package as the plan answer, so an older server never sees its button).
 */
export function usePaymentLinksPlan(companyId: string): boolean | null {
  const [plan, setPlan] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    setPlan(null);
    const id = String(companyId || "").trim();
    if (!id) return () => { active = false; };
    void paymentLinksAccess(id).then((answer) => { if (active) setPlan(answer.planAllowed); });
    return () => { active = false; };
  }, [companyId]);
  return plan;
}
