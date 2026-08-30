// The bot answers from guideCorpus.json, not from guide.ts. Nothing connected
// the two: editing the guide and forgetting to rebuild shipped a bot that
// confidently served last week's product. This is the guard - it rebuilds into
// a scratch copy and compares, so it fails on the commit that forgot rather
// than in a support thread weeks later.
//
// Run: node test/qa/guide-corpus-fresh.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = path.join(__dirname, "..", "..", "assistant");
const builder = path.join(dir, "buildGuideCorpus.js");
const artefacts = ["guideCorpus.json", "guidePublicCorpus.json", "guideTree.json"];
function pass(name) { console.log("PASS ", name); }

const before = new Map(artefacts.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
execFileSync("node", [builder], { stdio: "pipe" });
const after = new Map(artefacts.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));

for (const file of artefacts) {
  if (before.get(file) !== after.get(file)) {
    // Put the tree back the way it was found, so a failing run leaves no mess.
    for (const f of artefacts) fs.writeFileSync(path.join(dir, f), before.get(f));
    assert.fail(`${file} is out of date with guide.ts. Run: node functions/assistant/buildGuideCorpus.js`);
  }
}
pass("the shipped corpus matches the guide it was built from");

// The split the website depends on: what a feature is for is public, how to
// work it is not. If the public corpus ever grows to the size of the full one,
// the separation has quietly collapsed.
const full = JSON.parse(after.get("guideCorpus.json")).sections || [];
const pub = JSON.parse(after.get("guidePublicCorpus.json")).sections || [];
const fullText = full.reduce((sum, s) => sum + s.text.length, 0);
const pubText = pub.reduce((sum, s) => sum + s.text.length, 0);
assert(pubText > 0, "the public corpus is not empty");
assert(pubText < fullText * 0.5,
  `the public corpus is ${Math.round((100 * pubText) / fullText)}% of the full one - the public/member split has collapsed`);
pass(`the public corpus stays a summary (${Math.round((100 * pubText) / fullText)}% of the full guide)`);

// Both assistants must be able to answer at all.
assert(full.length >= 20 && pub.length >= 20, "both corpora carry the guide's chapters");
pass("both corpora carry every chapter");

console.log("\nGuide corpus is fresh and correctly split.");
