/**
 * IG-3 (29 Oct 2026): the server writes a fixed English line in place of an attachment NivaDesk cannot show
 * (functions/instagramClient.js ATTACHMENT_PLACEHOLDERS; whatsappMetaClient.js "[location]", "[contact card]").
 * (a) the web list is exactly the server's lines, (b) each is translated in every app language, (c) only an exact line
 * is treated as NivaDesk's — a customer who types "[video]" is shown as written, (d) the inbox screen uses the helper
 * for the bubble and the list preview (source pins).
 *
 * Run: npm run test:inbox-placeholders   (npx tsx scripts/check-inbox-placeholders.mts)
 * Control: --screen <copy of InboxContent.tsx without the helper> -> must FAIL (d).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { PROVIDER_PLACEHOLDER_LINES, isProviderPlaceholderLine } from "../lib/studioflow/inboxPlaceholders";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const screenArg = process.argv.indexOf("--screen");
const screenPath = screenArg > 0 ? path.resolve(process.argv[screenArg + 1]) : path.join(root, "app/inbox/InboxContent.tsx");

let failed = 0; let passed = 0;
function test(name: string, body: () => void) {
  try { body(); passed += 1; console.log(`PASS ${name}`); } catch (error) { failed += 1; console.log(`FAIL ${name}: ${(error as Error).message.split("\n")[0]}`); }
}

// The server's lines, copied from the deploy tree (wa-ig/trees/igw/functions/instagramClient.js) and whatsappMetaClient.js.
const SERVER_LINES = [
  "[video — open Instagram to see it]",
  "[voice message — open Instagram to hear it]",
  "[file — open Instagram to see it]",
  "[shared post — open Instagram to see it]",
  "[shared reel — open Instagram to see it]",
  "[story mention — open Instagram to see it]",
  "[link — open Instagram to see it]",
  "[attachment — open Instagram to see it]",
  "[message Instagram does not share with apps — open Instagram to see it]",
  "[location]",
  "[contact card]"
];

test("P1 the web list is exactly the server's lines", () => {
  assert.deepEqual([...PROVIDER_PLACEHOLDER_LINES].sort(), [...SERVER_LINES].sort());
});
test("P2 every line is translated in every app language (11 x 11)", () => {
  const missing: string[] = [];
  for (const line of PROVIDER_PLACEHOLDER_LINES) {
    for (const language of SUPPORTED_STUDIO_LANGUAGES) {
      if (language === "English") continue;
      const out = studioT(line, language);
      if (!out || out === line || !out.startsWith("[") || !out.endsWith("]")) missing.push(`${language}: ${line}`);
    }
  }
  assert.equal(missing.length, 0, missing.slice(0, 5).join(" | "));
});
test("P3 English shows the line as stored", () => {
  for (const line of PROVIDER_PLACEHOLDER_LINES) assert.equal(studioT(line, "English"), line);
});
test("P4 only an exact line is NivaDesk's: a customer's '[video]' or own words are not", () => {
  assert.equal(isProviderPlaceholderLine("[video — open Instagram to see it]"), true);
  assert.equal(isProviderPlaceholderLine("[video]"), false);
  assert.equal(isProviderPlaceholderLine(" [location]"), false);
  assert.equal(isProviderPlaceholderLine("hello"), false);
  assert.equal(isProviderPlaceholderLine(null), false);
  assert.equal(isProviderPlaceholderLine(undefined), false);
});
test("P5 the inbox screen translates the bubble and the list preview through the helper", () => {
  const source = readFileSync(screenPath, "utf8");
  assert.match(source, /if \(isProviderPlaceholderLine\(stored\)\) return t\(stored\);/, "list preview");
  assert.match(source, /isProviderPlaceholderLine\(entry\.message\.text\)\s*\n?\s*\? <em className="inbox-msg-placeholder" dir="auto">\{t\(entry\.message\.text as string\)\}<\/em>/, "message bubble");
});

console.log(`inbox-placeholders: ${passed}/${passed + failed} pass`);
process.exit(failed ? 1 : 0);
