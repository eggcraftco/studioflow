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

// 5. The billing questions people actually ask before they trust a product with
// their work. These have to land on the trial chapter, not on Plan & Access —
// the settings page says what the plans are, not when the fortnight starts or
// what happens when it ends.
{
  const questions = [
    "when does my free trial start?",
    "will I be charged when the trial ends?",
    "what happens to my orders after the trial?",
    "do I need a credit card to sign up?",
    "how much do I save with yearly billing?"
  ];
  for (const question of questions) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /trial/i.test(p)),
      `"${question}" should reach the trial chapter, got: ${paths.join(" | ")}`
    );
  }
  pass("trial and billing questions reach the trial chapter");
}

// 6. The two promises that make the trial safe to start have to be in the text,
// not merely implied, because the bot answers only from these excerpts.
{
  // The chapter is split into sub-sections, so read the whole subtree: what
  // matters is that the promises are somewhere the retrieval can hand over.
  const trial = CORPUS.filter((s) => /trial/i.test(s.id || "") || /trial/i.test(s.path || ""));
  const text = trial.map((s) => s.text).join("\n");
  assert(trial.length >= 4, `expected the trial sub-sections, got ${trial.length}`);
  assert(/no credit card/i.test(text), "the guide says no credit card is taken");
  assert(/[Nn]othing is deleted/.test(text), "the guide says nothing is deleted");
  assert(
    /first order/i.test(text),
    "the guide says the trial starts at the first order, not at sign-up"
  );
  pass("the trial chapter states no credit card, nothing deleted, and when it starts");
}

// 7. The setup screen the guide describes has to be the one that ships. The old
// chapter still described an industry dropdown and a business-description box.
{
  const setup = CORPUS.filter((s) =>
    /getting-started|first-sign-in-setup|what-the-setup-changes/.test(s.id || "")
  );
  const text = setup.map((s) => s.text).join("\n");
  assert(setup.length >= 3, `expected the setup sub-sections, got ${setup.length}`);
  assert(
    /four-question/i.test(text),
    "getting started describes the wizard that actually ships"
  );
  assert(
    /Ready for Collection/i.test(text),
    "it shows that the answers change the product, not just the copy"
  );
  // The live probe had this land on Settings > PDF Export, where the bot then
  // invented a setup flow out of whatever Settings pages it had been handed.
  for (const question of [
    "how do I set up my workspace when I first sign in?",
    "what happens the first time I open NivaDesk?",
    "can I change the answers I gave during setup?"
  ]) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /getting started|setup/i.test(p)),
      `"${question}" should reach the setup chapter, got: ${paths.join(" | ")}`
    );
  }
  pass("getting started matches the setup screen that ships, and is reachable");
}

// 7. Etsy is the first integration that is a real connection rather than a
// generic webhook, and the guide used to list it among the webhook platforms.
// A seller asking about it must land on the Etsy chapter, and the chapter must
// answer the two questions that decide whether they trust it: what NivaDesk is
// allowed to do in their shop, and what happens to their orders if they leave.
{
  const section = CORPUS.find((s) => s.id === "set-etsy");
  assert(section, "the guide has an Etsy chapter");
  assert(
    /read-only/i.test(section.text),
    "the chapter says the Etsy access is read-only"
  );
  assert(
    /stays exactly where it is|orders are untouched/i.test(section.text),
    "the chapter says what disconnecting does to work already here"
  );
  assert(
    /fifteen minutes/i.test(section.text),
    "the chapter states how often it syncs"
  );
  for (const question of [
    "how do I connect my Etsy shop?",
    "will NivaDesk change my Etsy listings?",
    "what happens to my orders if I disconnect Etsy?",
    "how often does NivaDesk check Etsy for new orders?",
    "why did an Etsy order not import?"
  ]) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /etsy/i.test(p)),
      `"${question}" should reach the Etsy chapter, got: ${paths.join(" | ")}`
    );
  }
  pass("Etsy questions reach the Etsy chapter, and it answers the trust questions");
}

console.log("\n✅ GUIDE RETRIEVAL GEÇTİ");
