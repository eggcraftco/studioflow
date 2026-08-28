#!/usr/bin/env node
//
// Turns the web app's user guide (studioflow-web/lib/publicSite/guide.ts) into
// JSON for the server:
//
//   guideCorpus.json  flat sections the in-app assistant searches
//   guideTree.json    the structured tree the getUserGuide callable serves
//
// The guide is a paid-plan feature, so the page no longer imports it directly:
// the web bundle would hand every word to anyone who opened /guide.
//
// The guide stays the single source of truth: run this after editing it.
//   node functions/assistant/buildGuideCorpus.js
//
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "..", "studioflow-web", "lib", "publicSite", "guide.ts");
const TRANSLATIONS = path.join(__dirname, "..", "..", "studioflow-web", "lib", "publicSite", "guideTranslations.ts");
const TARGET = path.join(__dirname, "guideCorpus.json");
const TREE_TARGET = path.join(__dirname, "guideTree.json");

const source = fs.readFileSync(SOURCE, "utf8");

// Reads a plain data literal (`const NAME... = [` or `= {`) out of a TypeScript
// module by walking brackets, then evaluates it. The literals here are strings,
// arrays and objects only, so this avoids pulling in the TypeScript toolchain.
function readLiteral(text, marker, open, close, label) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`${label} not found`);
  // Start from the bracket after the "=", not one inside the type annotation.
  const literalStart = text.indexOf(open, text.indexOf("=", start));
  let depth = 0;
  let literalEnd = -1;
  for (let i = literalStart; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) { literalEnd = i + 1; break; }
    }
  }
  if (literalEnd < 0) throw new Error(`Could not find the end of ${label}`);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${text.slice(literalStart, literalEnd)};`)();
}

const tree = readLiteral(source, "const TREE_EN: GuideNode[] = [", "[", "]", "TREE_EN");
const treeTr = readLiteral(source, "const TREE_TR: GuideNode[] = [", "[", "]", "TREE_TR");
const dict = readLiteral(
  fs.readFileSync(TRANSLATIONS, "utf8"),
  "export const GUIDE_T",
  "{",
  "}",
  "GUIDE_T"
);

// A chapter's sub-headings are what it is ABOUT — "Blocked means blocked, with
// a reason" is a heading, not prose. Kept as their own field so the retrieval
// can weight them above body text; buried in `text` they scored the same as an
// incidental mention and whole chapters lost to bigger ones.
function nodeHeadings(node) {
  return (node.blocks || [])
    .filter((block) => block.kind === "sub")
    .map((block) => String(block.text || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function nodeText(node) {
  const parts = [];
  for (const block of node.blocks || []) {
    if (block.kind === "para" || block.kind === "sub") parts.push(String(block.text || ""));
    else if (Array.isArray(block.items)) parts.push(block.items.map((item) => `- ${item}`).join("\n"));
  }
  return parts.join("\n").replace(/\s+\n/g, "\n").trim();
}

const sections = [];
function walk(nodes, trail) {
  for (const node of nodes || []) {
    const title = String(node.title || node.id || "");
    const pathTitles = [...trail, title];
    const text = nodeText(node);
    if (text) {
      sections.push({
        id: String(node.id || ""),
        title,
        path: pathTitles.join(" › "),
        headings: nodeHeadings(node),
        text
      });
    }
    if (node.children?.length) walk(node.children, pathTitles);
  }
}
walk(tree, []);

fs.writeFileSync(TARGET, JSON.stringify({ builtFrom: "studioflow-web/lib/publicSite/guide.ts", sections }, null, 1));
console.log(`guideCorpus.json: ${sections.length} sections, ${Math.round(fs.statSync(TARGET).size / 1024)} KB`);

// English and Turkish are written trees; every other language is localized from
// the English tree string by string, the same way the page used to do it.
fs.writeFileSync(
  TREE_TARGET,
  JSON.stringify({
    builtFrom: "studioflow-web/lib/publicSite/guide.ts",
    trees: { English: tree, "Türkçe": treeTr },
    dict
  })
);
console.log(`guideTree.json: ${Object.keys(dict).length} localized languages, ${Math.round(fs.statSync(TREE_TARGET).size / 1024)} KB`);
