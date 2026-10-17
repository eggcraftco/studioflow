/**
 * /integrations/claude — the public setup page for the NivaDesk connector for Claude
 * (17 Oct 2026). Imports the real modules, no copies of the tables under test.
 *
 *  1. Every site language has the page, with the same shape as English: the same
 *     tool names in the same order, the same number of steps, rows and questions.
 *  2. The page's tool list is the connector's tool list (21 tools), and each tool's
 *     read / write / destructive tag follows the live server's annotations.
 *     Optional: NIVADESK_TOOLS_LIST=<path to a claudeMcp tools/list JSON> compares against a
 *     captured Claude listing.
 *  3. Nothing promises trial terms (membership decisions K2–K6 are open), and the
 *     trademark line disclaims any affiliation with Anthropic in every language.
 *  4. The connector address is set in ONE constant (the live Claude endpoint,
 *     https://nivadesk.app/claudeMcp, 17 Oct 2026); because it is set the page is
 *     indexable and in the sitemap (both read the constant).
 *  5. The release behaviour is said in every language: receipts through a 15-minute
 *     upload link (no file through Claude), 90-day stay-connected, independent
 *     connections, Disconnect vs Disconnect all, and a link to Settings › Integrations.
 *
 * Run: npm run test:claude-guide   (npx tsx scripts/check-claude-guide.mts)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_HELP_COPY, type ClaudeHelpCopy } from "../lib/publicSite/claudeHelpCopy";
import { CLAUDE_CONNECTOR_TOOLS, CLAUDE_CONNECTOR_URL } from "../lib/studioflow/claudeConnector";
import { SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : "");

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

const EN = CLAUDE_HELP_COPY.English;
const toolNames = (copy: ClaudeHelpCopy) => copy.groups.flatMap(group => group.tools.map(([name]) => name));

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach(item => strings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach(item => strings(item, out));
  return out;
}

check("1a every site language has the page", () => {
  const missing = SUPPORTED_STUDIO_LANGUAGES.filter(language => !CLAUDE_HELP_COPY[language]);
  assert.deepEqual(missing, []);
});

check("1b every language has English's shape (tool names, steps, rows, questions)", () => {
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    const copy = CLAUDE_HELP_COPY[language]!;
    assert.deepEqual(toolNames(copy), toolNames(EN), `${language}: tool names`);
    assert.deepEqual(copy.groups.map(group => group.examples.length), EN.groups.map(group => group.examples.length), `${language}: examples`);
    for (const key of ["who", "connectSteps", "connectNotes", "safety", "data", "disconnect", "faq", "heroFacts"] as const) {
      assert.equal((copy[key] as readonly unknown[]).length, (EN[key] as readonly unknown[]).length, `${language}: ${key}`);
    }
    const empty = strings(copy).filter(text => !text.trim());
    assert.deepEqual(empty, [], `${language}: empty strings`);
  }
});

check("1c translations are translations (no language is a copy of English)", () => {
  for (const language of SUPPORTED_STUDIO_LANGUAGES.filter(item => item !== "English")) {
    const copy = CLAUDE_HELP_COPY[language]!;
    assert.notEqual(copy.heroIntro, EN.heroIntro, language);
    assert.notEqual(copy.data[0][1], EN.data[0][1], language);
  }
});

check("2a the page lists exactly the connector's 21 tools, each once", () => {
  const listed = toolNames(EN);
  assert.equal(CLAUDE_CONNECTOR_TOOLS.length, 21);
  assert.equal(new Set(listed).size, listed.length, "a tool is listed twice");
  assert.deepEqual([...listed].sort(), CLAUDE_CONNECTOR_TOOLS.map(tool => tool.name).sort());
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    assert.ok(CLAUDE_HELP_COPY[language]!.toolsIntro.includes(String(CLAUDE_CONNECTOR_TOOLS.length)), `${language}: tool count in the intro`);
  }
});

check("2b read / write / destructive follow the server's annotations", () => {
  const destructive = CLAUDE_CONNECTOR_TOOLS.filter(tool => tool.mode === "destructive").map(tool => tool.name).sort();
  // The Claude surface's annotations (claudeMcp tools/list, 17 Oct 2026): five differ
  // from ChatGPT's — four note/order-note writes are destructive, attach is a plain write.
  assert.deepEqual(destructive, ["add_order_note", "append_note", "archive_note", "pin_note", "update_note", "update_order_status"]);
  assert.equal(CLAUDE_CONNECTOR_TOOLS.find(tool => tool.name === "attach_bank_receipt")!.mode, "write");
  const listing = process.env.NIVADESK_TOOLS_LIST;
  if (!listing) {
    console.log("     (NIVADESK_TOOLS_LIST not set: compared with the 17 Oct claudeMcp annotations built into claudeConnector.ts only)");
    return;
  }
  const parsed = JSON.parse(readFileSync(listing, "utf8"));
  const tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }> = parsed.result?.tools ?? parsed.tools ?? parsed;
  assert.equal(tools.length, CLAUDE_CONNECTOR_TOOLS.length, "live tool count");
  for (const tool of tools) {
    const expected = tool.annotations?.readOnlyHint ? "read" : tool.annotations?.destructiveHint ? "destructive" : "write";
    const ours = CLAUDE_CONNECTOR_TOOLS.find(item => item.name === tool.name);
    assert.ok(ours, `live tool ${tool.name} is not on the page`);
    assert.equal(ours!.mode, expected, `${tool.name}: mode`);
  }
});

check("3a no trial terms are promised (K2–K6 open)", () => {
  const english = strings(EN).join(" ");
  assert.ok(!/trial/i.test(english), "English mentions a trial");
  assert.ok(!/\b14[- ]day/i.test(english), "English mentions 14 days");
});

check("3b every language disclaims affiliation with Anthropic and names the operator", () => {
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    const line = CLAUDE_HELP_COPY[language]!.trademark;
    assert.ok(line.includes("Anthropic, PBC") && line.includes("EGGCRAFT LIMITED"), language);
  }
});

check("4a the connector address is one constant: the live Claude endpoint", () => {
  const page = read("app/integrations/claude/ClaudeHelpPage.tsx");
  assert.ok(page.includes("CLAUDE_CONNECTOR_URL"), "the page reads the constant");
  assert.ok(!/https:\/\/[^"'\s]*chatgptMcp/.test(page + read("lib/publicSite/claudeHelpCopy.ts")), "the ChatGPT endpoint is not offered as the Claude address");
  assert.equal(CLAUDE_CONNECTOR_URL, "https://nivadesk.app/claudeMcp");
});

check("4b the page's robots and sitemap entry follow the constant (set → indexable, listed)", () => {
  const metadata = read("app/integrations/claude/page.tsx");
  assert.ok(/robots: CLAUDE_CONNECTOR_URL \? undefined : \{ index: false, follow: true \}/.test(metadata), "metadata follows the constant");
  const sitemap = read("app/sitemap.ts");
  assert.ok(/\.\.\.\(CLAUDE_CONNECTOR_URL \? \[\{ path: "\/integrations\/claude"/.test(sitemap), "sitemap entry follows the constant");
});

check("4c support address is the one the legal pages give", () => {
  assert.ok(read("app/integrations/claude/ClaudeHelpPage.tsx").includes('const SUPPORT_EMAIL = "contact@nivadesk.co.uk"'));
  assert.ok(read("lib/publicSite/privacyPolicy.ts").includes("Email: contact@nivadesk.co.uk"));
});

check("5a every language says the release behaviour", () => {
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    const copy = CLAUDE_HELP_COPY[language]!;
    const attach = copy.groups.flatMap(group => group.tools).find(([name]) => name === "attach_bank_receipt")![1];
    assert.ok(attach.includes("15") && attach.includes("NivaDesk") && attach.includes("Claude"), `${language}: receipt upload link`);
    assert.ok(copy.connectNotes[0].includes("90"), `${language}: stay connected (90 days)`);
    assert.ok(/ChatGPT/.test(copy.connectNotes[1]) && /Claude Code/.test(copy.connectNotes[1]), `${language}: independent connections`);
    assert.ok(copy.disconnect[1][1].includes("Disconnect all") && copy.disconnect[1][1].includes("Claude Code"), `${language}: one vs all`);
    assert.ok(copy.faq.length === EN.faq.length && copy.disconnectLink.trim(), `${language}: faq + settings link`);
  }
  assert.ok(!/Attach a receipt you share in the conversation/.test(strings(EN).join(" ")), "the old ChatGPT-style receipt sentence is gone");
});

check("5b the page's internal links are the real routes", () => {
  const page = read("app/integrations/claude/ClaudeHelpPage.tsx");
  assert.ok(page.includes('const SETTINGS_INTEGRATIONS_HREF = "/settings?section=integrations"'));
  for (const route of ["app/settings/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx", "app/security/page.tsx", "app/subprocessors/page.tsx", "app/account-deletion/page.tsx", "app/contact/page.tsx", "app/bank/page.tsx", "app/claudeMcp/route.ts"]) {
    assert.ok(existsSync(join(ROOT, route)), `${route} exists`);
  }
  assert.ok(read("app/settings/page.tsx").includes('params.get("section")'), "settings reads ?section=");
  assert.ok(read("app/bank/page.tsx").includes('searchParams.get("receiptUpload")'), "bank reads ?receiptUpload=");
});

check("6a no absolute confirmation promise; confirmations depend on Claude's settings, NivaDesk permissions always apply", () => {
  // Owner, 17 Oct 2026: NivaDesk does not decide whether Claude asks before a tool.
  const banned = /always asks|asks you first|asks before it changes|asks for your approval before every|Claude asks first|her zaman size sorar|Claude önce sorar|fragt Claude Sie immer|Claude fragt zuerst|vous demande toujours|ti chiede sempre|siempre te pregunta|pergunta-lhe sempre|всегда спрашивает|必ず確認|总会先征求|يسألك Claude دائمًا|हमेशा आपसे पूछता/;
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    const text = strings(CLAUDE_HELP_COPY[language]!).join(" ");
    assert.ok(!banned.test(text), `${language}: absolute confirmation promise: ${text.match(banned)?.[0]}`);
    assert.ok(text.includes("Claude"), language);
  }
  assert.ok(/depends on Claude's own settings/.test(EN.toolsIntro) && /enforced on its servers on every call/.test(EN.toolsIntro));
});

check("6b the guide names the Settings heading that covers both assistants", () => {
  const headings: Record<string, string> = {"English": "AI assistants (ChatGPT and Claude)", "Türkçe": "Yapay zekâ asistanları (ChatGPT ve Claude)", "Deutsch": "KI-Assistenten (ChatGPT und Claude)", "Français": "Assistants IA (ChatGPT et Claude)", "Italiano": "Assistenti IA (ChatGPT e Claude)", "Español (Spanish)": "Asistentes de IA (ChatGPT y Claude)", "Português": "Assistentes de IA (ChatGPT e Claude)", "Русский (Russian)": "ИИ-ассистенты (ChatGPT и Claude)", "日本語 (Japanese)": "AI アシスタント（ChatGPT と Claude）", "中文 (Chinese)": "AI 助手（ChatGPT 和 Claude）", "العربية (Arabic)": "مساعدو الذكاء الاصطناعي (ChatGPT وClaude)", "हिन्दी (Hindi)": "AI सहायक (ChatGPT और Claude)"};
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    assert.ok(CLAUDE_HELP_COPY[language]!.disconnect[1][1].includes(headings[language]), `${language}: disconnect row names "${headings[language]}"`);
  }
  const section = read("app/settings/ChatGPTIntegrationSection.tsx");
  assert.ok(section.includes('t("AI assistants (ChatGPT and Claude)")'), "Settings section heading");
  assert.ok(!section.includes('t("ChatGPT access to this workspace")') && !section.includes('t("No ChatGPT connection.'), "no ChatGPT-only heading or empty state");
  assert.ok(read("lib/studioflow/integrations.ts").includes('name: "AI assistants (ChatGPT and Claude)"'), "hub card name");
});

console.log(`\nclaude-guide: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
