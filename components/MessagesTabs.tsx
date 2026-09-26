"use client";

// One "Messages" place with two streams: Customers (WhatsApp, the customer
// inbox at /inbox) and Team (the workshop talking to itself, /messages).
//
// ONE PLACE, NEVER ONE LIST. The two stay separate tabs on purpose: a customer
// is a stranger writing to the workshop, a teammate is a colleague, and a
// stranger's message must never be read — or acted on — as if a colleague had
// written it. The tabs sit side by side so nobody has to hunt through the menu,
// and each carries its own unread count.

import Link from "next/link";
import { useEffect, useState } from "react";
import { studioT } from "@/lib/studioflow/language";
import { loadCustomerInboxConversations } from "@/lib/studioflow/customerInbox";

export function MessagesTabs({
  active,
  language,
  companyId,
  customerUnread,
  teamUnread
}: {
  active: "customers" | "team";
  language: string | null | undefined;
  /** When given and `customerUnread` is not, the customer count is read here. */
  companyId?: string;
  customerUnread?: number;
  teamUnread?: number;
}) {
  const t = (text: string) => studioT(text, language);
  const [loadedCustomerUnread, setLoadedCustomerUnread] = useState<number | null>(null);

  useEffect(() => {
    if (customerUnread !== undefined || !companyId) return;
    let alive = true;
    // A workspace without the customer inbox answers with a refusal; the tab
    // then simply shows no number rather than an error in someone else's page.
    loadCustomerInboxConversations(companyId)
      .then((rows) => { if (alive) setLoadedCustomerUnread(rows.filter((row) => row.unread).length); })
      .catch(() => { if (alive) setLoadedCustomerUnread(null); });
    return () => { alive = false; };
  }, [companyId, customerUnread]);

  const customers = customerUnread ?? loadedCustomerUnread ?? 0;
  const team = teamUnread ?? 0;

  return (
    <nav className="msg-tabs" aria-label={t("Messages")}>
      <Link
        href="/inbox"
        className={active === "customers" ? "msg-tab is-active" : "msg-tab"}
        aria-current={active === "customers" ? "page" : undefined}
      >
        <span>{t("Customers")}</span>
        <span className="msg-tab-channel">WhatsApp</span>
        {customers > 0 ? <span className="msg-tab-count" aria-label={t("Unread")}>{customers > 99 ? "99+" : customers}</span> : null}
      </Link>
      <Link
        href="/messages"
        className={active === "team" ? "msg-tab is-active" : "msg-tab"}
        aria-current={active === "team" ? "page" : undefined}
      >
        <span>{t("Team")}</span>
        {team > 0 ? <span className="msg-tab-count" aria-label={t("Unread")}>{team > 99 ? "99+" : team}</span> : null}
      </Link>
    </nav>
  );
}
