// The four apps do not share a menu, so the guide tags the lines that only
// apply to one of them. The assistant is told which app the reader is in and
// reads only those tags plus the untagged lines, which are true everywhere.
//
// A tag nobody recognises is worse than no tag: the line quietly belongs to
// no app, so nobody is ever shown it. This test is what stops that.
//
// Run: node test/qa/guide-platform-tags.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "..");
const corpus = require(path.join(__dirname, "..", "..", "assistant", "guideCorpus.json")).sections || [];
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
function pass(name) { console.log("PASS ", name); }

// The tags the server actually knows about, lifted rather than restated.
const table = server.match(/const APP_ASSISTANT_PLATFORMS = \{[\s\S]*?\};/);
assert(table, "the server still declares its platform table");
const allowed = new Set([...table[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
assert(allowed.size >= 4, "the table names every app");

// Every [Bracket] at the start of a guide line must be one of them.
const used = new Map();
for (const section of corpus) {
  for (const line of String(section.text || "").split("\n")) {
    const m = line.match(/^-?\s*\[([^\]]+)\]/);
    if (!m) continue;
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(section.path || section.title);
  }
}
const unknown = [...used.keys()].filter((tag) => !allowed.has(tag));
assert.deepStrictEqual(unknown, [],
  `guide lines are tagged for apps the server does not know: ${unknown.join(", ")}. ` +
  `Known tags: ${[...allowed].join(", ")}`);
pass(`every platform tag in the guide is one the server recognises (${used.size} in use)`);

// A tagged step is only useful if the reader was told how to walk it.
const nav = corpus.find((s) => s.id === "finding-your-way");
assert(nav, "the guide still explains how to reach a section on each app");
for (const tag of allowed) {
  assert(nav.text.includes(`[${tag}]`), `the navigation chapter covers ${tag}`);
}
pass("the navigation chapter covers all four apps");

// The server has to actually tell the model which app it is talking to.
assert(/This person is using NivaDesk on \$\{/.test(server),
  "the in-app prompt names the reader's app");
assert(/platform: "web"/.test(fs.readFileSync(path.join(root, "studioflow-web", "lib", "studioflow", "appAssistant.ts"), "utf8")),
  "the web client declares its platform");
assert(/"platform": platform/.test(fs.readFileSync(path.join(root, "EGGcraft", "AppHelpAssistantView.swift"), "utf8")),
  "the Apple client declares its platform");
assert(/"platform" to "android"/.test(fs.readFileSync(path.join(root, "studioflow-android", "app", "src", "main", "java", "uk", "co", "eggcraft", "studioflow", "data", "firebase", "StudioFlowRepository.kt"), "utf8")),
  "the Android client declares its platform");
pass("all four clients say which app they are");

// Same question, same answer: sampling is off for both assistants.
const temps = [...server.matchAll(/temperature: ([\d.]+)/g)].map((m) => m[1]);
assert(temps.filter((t) => t === "0").length >= 2,
  "both assistants ask for the same answer every time (temperature 0)");
pass("both assistants are pinned to temperature 0");

console.log("\nPlatform tagging is wired end to end.");
