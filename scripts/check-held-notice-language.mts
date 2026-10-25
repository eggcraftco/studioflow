// held-notify-i18n (25 Oct 2026): the "store orders are waiting" bell row is said in the reader's language from the
// server's params.count; an older row (no params) keeps the server's text. Run: npx tsx scripts/check-held-notice-language.mts
import { localizeActivityNotification } from "../lib/studioflow/notificationText";
import { studioImportPhrase } from "../lib/studioflow/countLabel";
import { SUPPORTED_STUDIO_LANGUAGES, studioT } from "../lib/studioflow/language";
import fs from "node:fs";
const SENT = "Your plan is full, so new store orders are being kept safe rather than imported. Mark finished work delivered to make room, or choose a plan.";
const base = { id: "held_integration_orders", companyId: "c", type: "integration_orders_held", title: "Store orders are waiting", message: "1 order from your store is waiting…", createdAtMillis: 1 } as any;
let pass = 0, fail = 0; const check = (n: string, ok: boolean) => { ok ? pass++ : (fail++, console.log("FAIL " + n)); };
for (const L of SUPPORTED_STUDIO_LANGUAGES) for (const n of [1, 2, 3, 5, 11, 21, 22, 31, 101]) {
  const out = localizeActivityNotification({ ...base, heldCount: n }, L);
  check(`${L} ${n} title`, out.title === studioImportPhrase(n, "heldStoreOrdersWaiting", L) && out.title.includes(String(n)));
  check(`${L} ${n} message`, out.message === (L === "English" ? SENT : studioT(SENT, L)) && (L === "English" || out.message !== SENT));
}
{ const old = localizeActivityNotification({ ...base, heldCount: 0 }, "Русский (Russian)"); check("older row unchanged", old.title === base.title && old.message === base.message); }
check("other types unchanged", localizeActivityNotification({ ...base, type: "delivery", heldCount: 4 }, "Deutsch").title === base.title);
const src = fs.readFileSync(new URL("../lib/studioflow/notifications.ts", import.meta.url), "utf8");
check("model reads params.count", /heldCount: heldCountOf\(data\)/.test(src));
check("drawer gets localized rows", /notifications=\{notificationsShown\}/.test(fs.readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8")));
check("home activity localized", /activity: localizedActivity/.test(fs.readFileSync(new URL("../lib/studioflow/useHomeData.ts", import.meta.url), "utf8")));
console.log(`RESULT ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
