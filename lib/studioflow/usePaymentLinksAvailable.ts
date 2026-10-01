"use client";

import { useEffect, useState } from "react";
import { paymentLinksAvailable } from "@/lib/studioflow/stripeConnect";

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
