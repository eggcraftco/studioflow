// Stripe onboarding can be resumed: when Stripe still asks for details (status "restricted"), the owner sees
// "Continue with Stripe", which asks the server for a fresh link on the SAME account. Exit 1 on any miss.
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const section = read("app/settings/StripeIntegrationSection.tsx");
const lang = read("lib/studioflow/language.ts");
let failures = 0; let checks = 0;
const check = (ok, what) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };
const cond = section.match(/\{status === "disconnected" \|\| status === "onboarding" \|\| status === "restricted" \? \(/);
check(Boolean(cond), "the connect/continue button is offered for disconnected, onboarding AND restricted");
const at = cond ? cond.index : -1;
const block = at >= 0 ? section.slice(at, at + 900) : "";
check(/disabled=\{!isOwner \|\| busy === "connect"\}/.test(block), "only the workspace owner can press it (unchanged)");
check(/onClick=\{\(\) => void connect\(\)\}/.test(block), "it runs the same connect() that asks the server for an onboarding link");
check(/status === "disconnected" \? t\("Connect Stripe"\) : t\("Continue with Stripe"\)/.test(block), "a restricted or onboarding account reads \"Continue with Stripe\"; only a disconnected one reads \"Connect Stripe\"");
check(/beginStripeConnectOnboarding/.test(read("lib/studioflow/stripeConnect.ts")), "connect() still calls beginStripeConnectOnboarding (the server reuses the stored account id)");
const row = lang.match(/^\s*"Continue with Stripe": \{([^\n]*)\}/m);
const translated = row ? (row[1].match(/"[^"]+": "[^"]+"/g) || []).length : 0;
check(translated >= 11, `"Continue with Stripe" is translated in the 11 non-English languages (found ${translated})`);
if (failures) { console.error(`${failures} of ${checks} stripe-resume checks failed.`); process.exit(1); }
console.log(`All ${checks} stripe-resume checks passed.`);
