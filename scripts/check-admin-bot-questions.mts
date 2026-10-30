/**
 * Insights ▸ Product ▸ Bot questions (30 Oct 2026): what people ask NivaDesk's two bots, read from
 * getAssistantQuestions (functions assistant/questionLog.js, admins only). Reads the real files.
 *
 *  1. The page is a section of the new Insights: in the Product group, in the address (#botquestions),
 *     with the business / QA view toggle.
 *  2. It asks the server with every filter the screen offers, and says plainly when the server does
 *     not have the callable yet.
 *  3. Any language reads: questions, English copies, answers and gaps render with dir="auto".
 *  4. No person on screen: the rows it reads carry no e-mail, uid or name field; CSV goes through the
 *     shared formula-safe toCsv.
 *  5. It fits a phone: the outer grid column cannot grow past the screen.
 *
 * Run: npm run test:admin-bot-questions   (npx tsx scripts/check-admin-bot-questions.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const hub = readFileSync(join(ROOT, "components/AdminInsightsHub.tsx"), "utf8");
const panel = readFileSync(join(ROOT, "components/AdminAssistantQuestionsPanel.tsx"), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n").join("\n     ")}`);
  }
}

check("1 a section of the new Insights: Product group, #botquestions, view toggle", () => {
  assert.match(hub, /\| "botquestions"/, "AdminHubPage knows the page");
  assert.match(hub, /\{ label: "Product", pages: \[[^\]]*\{ id: "botquestions", label: "Bot questions" \}/, "listed under Product");
  assert.match(hub, /const viewPages: AdminHubPage\[\] = \[[^\]]*"botquestions"/, "has the business / QA toggle");
  assert.match(hub, /page === "botquestions" \? <AdminAssistantQuestionsPanel view=\{view\} \/>/, "renders the panel with the view");
});

check("2 asks getAssistantQuestions with every filter, and names a missing server", () => {
  assert.match(panel, /httpsCallable<\{ days: number; view: AdminView; bot: string; outcome: string; language: string; q: string \}, QuestionsResult>\(functions, "getAssistantQuestions"\)/);
  assert.match(panel, /callable\(\{ days, view, bot, outcome, language, q: search \}\)/);
  assert.match(panel, /\}, \[days, view, bot, outcome, language, search\]\);/, "every filter refetches");
  assert.match(panel, /not-found/);
  assert.match(panel, /does not have getAssistantQuestions yet/);
});

check("3 every language reads: question, English copy, answer and gaps are dir=auto", () => {
  assert.match(panel, /<div dir="auto" style=\{\{ fontWeight: 600 \}\}>\{row\.question/);
  assert.match(panel, /<div dir="auto" style=\{\{ fontSize: 12\.5, whiteSpace: "pre-wrap", marginTop: 4 \}\}>\{row\.answer\}/);
  assert.match(panel, /<div dir="auto">\{gap\.question\}<\/div>/);
  assert.match(panel, /EN: \{row\.questionEn\}/, "the English copy is shown under a question in another language");
});

check("4 no person on screen; CSV through the formula-safe helper", () => {
  const item = panel.slice(panel.indexOf("type Item = {"), panel.indexOf("};", panel.indexOf("type Item = {")));
  for (const field of ["email", "uid", "name", "companyId"]) assert(!new RegExp(`\\b${field}\\b`).test(item), `rows carry no ${field}`);
  assert.match(panel, /import \{ downloadCsv, toCsv \} from "@\/lib\/studioflow\/adminLivePresence";/);
  assert.match(panel, /downloadCsv\(\s*`nivadesk-bot-questions-/);
});

check("5 fits a phone: the outer grid column cannot grow past the screen", () => {
  assert.match(panel, /display: "grid", gap: 14, gridTemplateColumns: "minmax\(0, 1fr\)"/);
  assert.match(panel, /minmax\(min\(280px, 100%\), 1fr\)/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
