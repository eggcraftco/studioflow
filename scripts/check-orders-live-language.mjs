// Etsy final round (25 Oct 2026): the Orders page (held-orders band, list, detail) must follow the live per-user
// language from AuthProvider, not only the one-off settings read made at load. Source check; run:
//   node scripts/check-orders-live-language.mjs [path-to-page.tsx]
import fs from "node:fs";
const file = process.argv[2] || new URL("../app/orders/page.tsx", import.meta.url).pathname;
const src = fs.readFileSync(file, "utf8");
let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
check("useAuth() supplies the live language", /const \{[^}]*language:\s*liveLanguage[^}]*\}\s*=\s*useAuth\(\)/.test(src));
check("the page language is the live language first", /const language = liveLanguage \|\|/.test(src));
check("no language taken only from moneySettings", !/const language = moneySettings\?\.selectedLanguage \?\? "English";/.test(src));
check("moneySettings.selectedLanguage follows the live language (detail pane)", /setMoneySettings\(current => \(current && current\.selectedLanguage !== liveLanguage/.test(src));
check("the held band is built with that language", /studioImportPhrase\(heldOrders\.heldCount \?\? 0, "heldStoreOrdersWaiting", language\)/.test(src));
console.log(`RESULT ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
