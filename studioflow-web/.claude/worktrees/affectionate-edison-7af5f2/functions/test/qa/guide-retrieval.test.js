// Does the help bot actually FIND the new features?
//
// The assistant answers only from guide excerpts — rule 4b in its prompt says
// it must never improvise steps. So a feature the retrieval cannot surface is a
// feature the bot will refuse to explain, however well the guide is written.
// This exercises the real retrieval over the real deployed corpus.
//
// Run: node test/qa/guide-retrieval.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CORPUS = require("../../assistant/guideCorpus.json").sections || [];

function pass(name) { console.log("PASS ", name); }

// The scorer, lifted from index.js so this tests the shipping code rather than
// a copy of it that could drift. The constants it closes over are passed in,
// and the `return` is put on its own line — appended to the end of a lifted
// block it lands inside a trailing `//` comment and silently disappears.
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

function lift(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  const rest = SOURCE.slice(start + 1);
  const nextTop = rest.search(/\n(?:function |const |async function |exports\.)/);
  return SOURCE.slice(start, start + 1 + nextTop);
}

function liftConst(name) {
  const start = SOURCE.indexOf(`const ${name} =`);
  const rest = SOURCE.slice(start + 1);
  const nextTop = rest.search(/\n(?:function |const |async function |exports\.)/);
  return SOURCE.slice(start, start + 1 + nextTop);
}

const appAssistantTokens = new Function(
  `${liftConst("APP_ASSISTANT_STOPWORDS")}\n${lift("appAssistantTokens")}\nreturn appAssistantTokens;`
)();

const appAssistantRelevantSections = new Function(
  "appAssistantCorpus", "appAssistantTokens", "APP_ASSISTANT_FULL_CORPUS_BUDGET",
  `${lift("appAssistantRelevantSections")}\nreturn appAssistantRelevantSections;`
)(() => CORPUS, appAssistantTokens, 60000);

function topPaths(question, limit = 4) {
  return appAssistantRelevantSections(question, limit).map((section) => section.path || section.title || "");
}

// 1. The corpus actually carries both new features.
{
  const ids = CORPUS.map((section) => section.id || "");
  assert(ids.includes("production"), "the Production chapter is in the corpus");
  const inventory = CORPUS.find((section) => section.id === "inventory");
  assert(inventory, "the Inventory chapter is still there");
  assert(/Categories/i.test(inventory.text), "Inventory carries the Categories rules");
  pass("both new features reached the corpus");
}

// 2. The questions a workshop would actually type reach the Production chapter.
{
  const questions = [
    "where is each job right now?",
    "how do I see which orders are blocked?",
    "how do I move a job to quality check?",
    "can I rename the production columns?",
    "what does the capacity number on a column mean?",
    "why does a blocked job ask for a reason?"
  ];
  for (const question of questions) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /production/i.test(p)),
      `"${question}" should reach Production, got: ${paths.join(" | ")}`
    );
  }
  pass("production questions reach the production chapter");
}

// 3. The same for categories — and these must land on Inventory, not somewhere
// that merely shares the word "category".
{
  const questions = [
    "how do I rename an inventory category?",
    "can I add my own inventory categories?",
    "what happens to the items if I delete a category?",
    "how do I merge two inventory categories?"
  ];
  for (const question of questions) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /inventory/i.test(p)),
      `"${question}" should reach Inventory, got: ${paths.join(" | ")}`
    );
  }
  pass("category questions reach the inventory chapter");
}

// 4. The separation the whole feature rests on has to be answerable, because it
// is the question a confused user will ask.
{
  const section = CORPUS.find((s) => s.id === "production");
  assert(
    /separate from order, payment and delivery/i.test(section.text),
    "the guide states the separation outright"
  );
  const paths = topPaths("is production status the same as order status?");
  assert(paths.some((p) => /production/i.test(p)), `got: ${paths.join(" | ")}`);
  pass("the bot can answer why production status is its own thing");
}

console.log("\n✅ GUIDE RETRIEVAL GEÇTİ");
