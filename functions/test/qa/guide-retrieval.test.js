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

// Home shipped across four platforms with no chapter at all, so every question
// about it landed somewhere else — "how do I rearrange my Home cards?" was
// answered out of the Notes chapter, which describes the phone HOME SCREEN
// WIDGET. Two plausible-sounding words in common and the bot confidently
// explains the wrong feature. That is the failure mode a missing chapter
// actually has: not silence, a wrong answer.
{
  const questions = [
    "how do I rearrange my Home cards?",
    "can I change the size of a card on Home?",
    // "how do I hide a card I do not use?" is deliberately NOT here: order
    // detail cards can be hidden too, so that question is genuinely ambiguous
    // and answering it from the Orders chapter is defensible. Naming the screen
    // is what a person actually does when they mean this one.
    "how do I remove a card from my Home screen?",
    "why can my colleague not see the Money card?",
    "does changing my Home layout change everyone else's?",
    "how do I put a card back after hiding it?"
  ];
  for (const question of questions) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /home/i.test(p)),
      `"${question}" should reach Home, got: ${paths.join(" | ")}`
    );
  }
  const home = CORPUS.find((s) => s.id === "home");
  assert(home, "the Home chapter is missing from the corpus");
  // The two facts a member cannot work out by looking at the screen.
  assert(/yours|not the workspace/i.test(home.text), "Home must say the layout is per person");
  assert(/financial access|access allows/i.test(home.text), "Home must say why a card is absent for a colleague");
  pass("Home questions reach the Home chapter, not the Notes widget");
}

// Customer SMS: the server has been complete for a week with no screen anywhere,
// so the first questions about it will arrive the day the screen ships. The one
// that matters most is "why has nothing sent" — the honest answer is that the
// sender name is with the operator, and a bot that cannot say that will invent
// a reason.
{
  const questions = [
    "how do I text my customer when their order is ready?",
    "why has no SMS been sent?",
    "can I use my own name as the SMS sender?",
    "how much does an SMS cost?",
    "how do I stop texting the customer about every status change?",
    "which plan includes customer SMS?"
  ];
  for (const question of questions) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /sms/i.test(p)),
      `"${question}" should reach Customer SMS, got: ${paths.join(" | ")}`
    );
  }
  const sms = CORPUS.find((s) => s.id === "set-sms");
  assert(sms, "the Customer SMS chapter is missing from the corpus");
  // The three facts a person cannot work out from the screen alone.
  assert(/not switched on yet|approval|registered/i.test(sms.text),
    "it must say why nothing sends yet");
  assert(/OFF by default/i.test(sms.text),
    "it must say every-status-change is off, and that this is deliberate");
  assert(/segment/i.test(sms.text),
    "it must explain that a long message costs more than one segment");
  pass("Customer SMS questions reach the SMS chapter");
}
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
  // Derived from the wizard, not hardcoded. The previous version of this
  // assertion required the literal string "four-question" — and TOTAL_STEPS had
  // become 5 when the plan step was added, so the guide's false sentence was
  // the one thing keeping this green. A test that names the answer can only
  // ever certify whatever was true the day it was written.
  const WIZARD = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "studioflow-web", "components", "OnboardingWizard.tsx"),
    "utf8"
  );
  // The wizard's steps are a named list now (STEP_ORDER), and the count is its
  // length — so count the entries rather than read a literal that no longer
  // exists. The literal is kept as a fallback for the day the list goes away.
  const orderMatch = WIZARD.match(/const STEP_ORDER: OnboardingStepKey\[\] = \[([^\]]+)\]/);
  const totalSteps = orderMatch
    ? orderMatch[1].split(",").map((entry) => entry.trim()).filter(Boolean).length
    : Number((WIZARD.match(/const TOTAL_STEPS = (\d+)/) || [])[1]);
  assert(
    Number.isFinite(totalSteps) && totalSteps > 0,
    "could not read TOTAL_STEPS out of OnboardingWizard.tsx"
  );
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const spelled = WORDS[totalSteps];
  assert(
    new RegExp(`${spelled}-step|${spelled} step|${totalSteps}-step`, "i").test(text),
    `the wizard ships ${totalSteps} steps; the guide does not say so`
  );
  // And the step list has to have that many entries, or the prose is right and
  // the steps under it still describe the old flow.
  const setupSteps = (setup.map((s) => s.text).join("\n").match(/^- /gm) || []).length;
  assert(
    setupSteps >= totalSteps,
    `the guide lists ${setupSteps} setup steps for a ${totalSteps}-step wizard`
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

// The website assistant answers ONLY from WEBSITE_ASSISTANT_FACTS plus retrieved
// guide excerpts, and rule 4 forbids it from claiming a feature that is not
// listed. The facts named platforms, plans, banking and billing — and not one
// word about connecting a shop. So "do you support Etsy?" and "do you work with
// Shopify?", two of the most likely pre-sales questions this product will ever
// be asked, both ended as "let me get a person onto this". Found by asking the
// live bot, which is the only place this shows.
{
  const fs = require("fs");
  const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const start = source.indexOf("const WEBSITE_ASSISTANT_FACTS = [");
  assert(start > 0, "WEBSITE_ASSISTANT_FACTS is still there");
  const facts = source.slice(start, source.indexOf("].join(", start));

  for (const platform of ["Etsy", "Shopify", "WooCommerce"]) {
    assert(
      facts.includes(platform),
      `the website assistant cannot mention ${platform}, so it will hand "do you support ${platform}?" to a human`
    );
  }
  assert(
    /read-only/.test(facts),
    "the facts should say the Etsy access is read-only — it is the first thing a seller asks"
  );
  pass("the website assistant can answer whether we connect to a shop");
}

// Faz 2 — Sync health. A merchant who sees "Stale" or "Dead" on a connection
// asks the bot what it means and what to press; the store-integrations chapter
// must answer with the card, the retry and the six-hour rule.
{
  const section = CORPUS.find((s) => s.id === "set-woocommerce");
  assert(section, "the guide has the store-integrations chapter");
  assert(/Sync health/.test(section.text), "the chapter names the Sync health card");
  assert(/Dead/.test(section.text) && /Retry/.test(section.text), "it explains a dead event and the retry");
  assert(/six hours/i.test(section.text), "it says when a connection counts as stale");
  for (const question of [
    "what does sync health mean on my Shopify connection?",
    "why does my Shopify connection say stale?",
    "how do I retry a dead event?",
    "what is a dead letter in NivaDesk?",
    "where can I see the last webhook from Shopify?"
  ]) {
    const paths = topPaths(question);
    assert(
      paths.some((p) => /integration/i.test(p)),
      `"${question}" should reach the store-integrations chapter, got: ${paths.join(" | ")}`
    );
  }
  pass("sync health questions reach the store-integrations chapter, which explains stale, dead and retry");
}

console.log("\n✅ GUIDE RETRIEVAL GEÇTİ");
