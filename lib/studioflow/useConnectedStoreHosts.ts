"use client";

// The hosts of the workspace's own store connections (8 Oct 2026), for the
// order page's "Open in WooCommerce" link: a WooCommerce shop runs on its own
// domain, so the stored admin address is opened only when its host is one the
// workspace connected (lib/studioflow/orderSourceLink.ts). One read per
// workspace, shared by every order page opened afterwards; `null` while it is
// on its way, `[]` when the workspace has no such connection or the read failed
// (a failed read refuses the link rather than guessing).
import { useEffect, useState } from "react";
import { getWooConnections } from "@/lib/studioflow/woocommerce";

const cache = new Map<string, Promise<string[]>>();

function hostOf(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
}

export function loadConnectedStoreHosts(companyId: string): Promise<string[]> {
  const existing = cache.get(companyId);
  if (existing) return existing;
  const pending = getWooConnections(companyId)
    .then(rows => Array.from(new Set(rows.map(row => hostOf(row.host) || hostOf(row.siteUrl)).filter(Boolean))))
    .catch(() => {
      cache.delete(companyId);   // a failed read is not remembered as "no connections"
      return [] as string[];
    });
  cache.set(companyId, pending);
  return pending;
}

/** Only asks when `enabled` (the order came from a shop on its own domain); otherwise answers `[]` at once. */
export function useConnectedStoreHosts(companyId: string, enabled: boolean): string[] | null {
  const [hosts, setHosts] = useState<string[] | null>(enabled ? null : []);
  useEffect(() => {
    if (!enabled) { setHosts([]); return; }
    if (!companyId) { setHosts([]); return; }
    let live = true;
    setHosts(null);
    void loadConnectedStoreHosts(companyId).then(result => { if (live) setHosts(result); });
    return () => { live = false; };
  }, [companyId, enabled]);
  return hosts;
}
