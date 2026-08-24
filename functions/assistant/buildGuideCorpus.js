#!/usr/bin/env node
//
// Turns the web app's user guide (studioflow-web/lib/publicSite/guide.ts) into a
// flat JSON corpus the in-app assistant can search.
//
// The guide stays the single source of truth: run this after editing it.
//   node functions/assistant/buildGuideCorpus.js
//
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "..", "studioflow-web", "lib", "publicSite", "guide.ts");
const TARGET = path.join(__dirname, "guideCorpus.json");

const source = fs.readFileSync(SOURCE, "utf8");

// Only the English tree: the assistant answers in the visitor's language from
// English source material, which is what the guide page itself falls back to.
const startMarker = "const TREE_EN: GuideNode[] = [";
const start = source.indexOf(startMarker);
if (start < 0) throw new Error("TREE_EN not found in guide.ts");

// Walk brackets to find the end of the array literal. Start from the bracket
// after the "=", not the one in the "GuideNode[]" type annotation.
const arrayStart = source.indexOf("[", source.indexOf("=", start));
let depth = 0;
let end = -1;
for (let i = arrayStart; i < source.length; i += 1) {
  const ch = source[i];
  if (ch === "[") depth += 1;
  else if (ch === "]") {
    depth -= 1;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end < 0) throw new Error("Could not find the end of TREE_EN");

const literal = source.slice(arrayStart, end);

// The literal is plain data (strings, arrays, objects) with unquoted keys, so a
// Function wrapper evaluates it without pulling in the TypeScript toolchain.
// eslint-disable-next-line no-new-func
const tree = new Function(`return ${literal};`)();

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
        text
      });
    }
    if (node.children?.length) walk(node.children, pathTitles);
  }
}
walk(tree, []);

fs.writeFileSync(TARGET, JSON.stringify({ builtFrom: "studioflow-web/lib/publicSite/guide.ts", sections }, null, 1));
console.log(`guideCorpus.json: ${sections.length} sections, ${Math.round(fs.statSync(TARGET).size / 1024)} KB`);
