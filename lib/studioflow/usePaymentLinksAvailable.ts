"use client";

import { useEffect, useState } from "react";
import { paymentLinksAvailable } from "@/lib/studioflow/stripeConnect";

/**
 * `true` once the server has said this workspace may use Payment Links;
 * `false` when it said no (outside the pilot, rail off) or could not be asked;
 * `null` while the answer is on its way. Every Payment Links surface renders
 * nothing unless this is exactly `true`.
 */
export function usePaymentLinksAvailable(companyId: string): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    setAvailable(null);
    void paymentLinksAvailable(companyId).then((value) => { if (active) setAvailable(value); });
    return () => { active = false; };
  }, [companyId]);
  return available;
}
