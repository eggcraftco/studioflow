// Etsy final round (25 Oct 2026): the order list card's countdown chip and built-in step values follow the reader's
// language (were English in every language but Turkish). Run: npx tsx scripts/check-order-card-language.mts
import fs from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
const src = fs.readFileSync(new URL("../components/OrderListCard.tsx", import.meta.url), "utf8");
let pass = 0, fail = 0; const check = (n: string, ok: boolean) => { ok ? pass++ : fail++; if (!ok) console.log("FAIL " + n); };
check("dueLabel takes the language", /function dueLabel\(order: OrderListCardItem, language\?: string \| null\)/.test(src));
check("dueLabel is called with the card language", /dueLabel\(order, displayLanguage\)/.test(src));
check("late chip uses the table entry", /t\("\{days\}d late"\)\.replace\("\{days\}"/.test(src));
check("no English-only late chip", !/return `\$\{Math\.abs\(days\)\}d late`;/.test(src));
check("status values go through studioT outside Turkish", /if \(!wantsTurkish\) return studioT\(displayValue, language \|\| "English"\);/.test(src));
for (const L of SUPPORTED_STUDIO_LANGUAGES) {
  for (const k of ["Not Yet", "In Progress", "Done", "Cancelled", "New", "Today", "Dispatched", "{days}d late"]) {
    const v = studioT(k, L);
    check(`${L}: ${k} has a word`, L === "English" ? v === k : v !== k && v.trim().length > 0);
  }
  check(`${L}: late keeps the number`, studioT("{days}d late", L).includes("{days}"));
}
check("English chip unchanged", studioT("{days}d late", "English").replace("{days}", "3") === "3d late");
check("a workspace's own status name is shown as typed", studioT("Waiting for Clay", "Русский (Russian)") === "Waiting for Clay");
console.log(`RESULT ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
