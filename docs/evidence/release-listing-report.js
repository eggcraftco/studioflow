#!/usr/bin/env node
/**
 * The 1.2.0 release listing, checked and printed.
 *
 * Reads docs/evidence/tools-list-candidate-orchestrator-on.json (written by
 * capture-tools-list.js --write: the working tree with NIVADESK_MCP_ORCHESTRATOR=1
 * and every other MCP flag unset) and checks it against the registry and the
 * dispatcher under that same flag state, then prints:
 *   1. one row per tool — the four hints and the advertised scopes;
 *   2. the per-hint justification lines the platform's MCP Server section asks
 *      for, straight from the registry (never retyped);
 * so the platform form can be filled from a file that the tests already hold
 * to the code.
 *
 * Usage: node docs/evidence/release-listing-report.js [--json]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const FUNCTIONS = path.join(REPO, "functions");
const FLAGS = { NIVADESK_MCP_ORCHESTRATOR: "1" };
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "tools-list-candidate-orchestrator-on.json"), "utf8"));
const registry = require(path.join(FUNCTIONS, "orchestrator", "registry"));
const HINTS = registry.ANNOTATION_KEYS;
const LABEL = { readOnlyHint: "Read Only", destructiveHint: "Destructive", idempotentHint: "Idempotent", openWorldHint: "Open World" };

// The dispatcher and the builder under the release flags, in a child so this
// process's environment does not leak into the measurement.
const driver = `
  for (const k of Object.keys(process.env)) if (/MCP/.test(k)) delete process.env[k];
  Object.assign(process.env, ${JSON.stringify(FLAGS)});
  const api = require(${JSON.stringify(path.join(FUNCTIONS, "index.js"))});
  process.stdout.write("<<<NV>>>" + JSON.stringify({
    available: [...api._nvMcpAvailableActions()].sort(),
    listed: api._nvMcpToolsWithSecuritySchemes().map((t) => t.name)
  }) + "<<<END>>>");
`;
const raw = execFileSync(process.execPath, ["-e", driver], { cwd: FUNCTIONS, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString();
const live = JSON.parse(raw.match(/<<<NV>>>([\s\S]*)<<<END>>>/)[1]);

const problems = [];
const expectNames = registry.publishedNames({ orchestrator: true });
const names = snapshot.tools.map((t) => t.name);
if (JSON.stringify(names) !== JSON.stringify(expectNames)) problems.push(`listing names differ from registry.publishedNames({orchestrator:true}): ${names.join(",")} vs ${expectNames.join(",")}`);
if (JSON.stringify(names) !== JSON.stringify(live.listed)) problems.push("the snapshot is stale: the builder lists different names now");
if (JSON.stringify([...names].sort()) !== JSON.stringify(live.available)) problems.push(`dispatcher/listing mismatch: dispatcher ${live.available.join(",")}`);
for (const tool of snapshot.tools) {
  for (const hint of HINTS) if (typeof tool.annotations[hint] !== "boolean") problems.push(`${tool.name}.${hint} is not a boolean`);
  const extra = Object.keys(tool.annotations).filter((k) => !HINTS.includes(k));
  if (extra.length) problems.push(`${tool.name} carries unknown annotation keys ${extra.join(",")}`);
  const expected = registry.annotationsFor(tool.name, { orchestrator: true });
  if (JSON.stringify(tool.annotations) !== JSON.stringify(expected)) problems.push(`${tool.name}: wire hints ${JSON.stringify(tool.annotations)} != registry ${JSON.stringify(expected)}`);
  const because = registry.justificationFor(tool.name);
  for (const hint of HINTS) if (!because || !/^Because /.test(String(because[hint] || ""))) problems.push(`${tool.name}.${hint} has no "Because …" reason`);
  const scopes = tool.securitySchemes && tool.securitySchemes[0] && tool.securitySchemes[0].scopes;
  if (JSON.stringify(scopes) !== JSON.stringify(registry.scopesFor(tool.name))) problems.push(`${tool.name}: advertised scopes ${JSON.stringify(scopes)} != registry ${JSON.stringify(registry.scopesFor(tool.name))}`);
}

const tf = (v) => (v ? "true" : "false");
const out = [];
out.push(`Release listing: ${snapshot.tools.length} tools — ${snapshot.meta.what}; captured at ${String(snapshot.meta.commit).slice(0, 8)}${snapshot.meta.functionsTreeDirtyAtCapture ? " (functions/ dirty at capture)" : ""}; listing sha256 ${snapshot.meta.listingSha256}`);
out.push(`Checks: ${problems.length === 0 ? "PASS — names = registry = dispatcher; four literal booleans per tool; hints = registry; a Because-line per hint; scopes = registry" : "FAIL"}`);
for (const p of problems) out.push(`  ! ${p}`);
out.push("");
out.push("| # | Tool | Read Only | Destructive | Idempotent | Open World | Scopes |");
out.push("|---|---|---|---|---|---|---|");
snapshot.tools.forEach((t, i) => out.push(`| ${i + 1} | \`${t.name}\` | ${tf(t.annotations.readOnlyHint)} | ${tf(t.annotations.destructiveHint)} | ${tf(t.annotations.idempotentHint)} | ${tf(t.annotations.openWorldHint)} | ${(t.securitySchemes[0].scopes || []).join(", ")} |`));
out.push("");
out.push("Per-tool justifications (paste into the platform's MCP Server section; the Idempotent line is on the wire and belongs in the release notes):");
for (const t of snapshot.tools) {
  const because = registry.justificationFor(t.name);
  out.push("");
  out.push(`### ${t.name}  readOnly=${tf(t.annotations.readOnlyHint)} destructive=${tf(t.annotations.destructiveHint)} idempotent=${tf(t.annotations.idempotentHint)} openWorld=${tf(t.annotations.openWorldHint)}`);
  for (const hint of HINTS) out.push(`- ${LABEL[hint]} (${tf(t.annotations[hint])}): ${because[hint]}`);
}
if (process.argv.includes("--json")) console.log(JSON.stringify({ problems, tools: snapshot.tools.map((t) => ({ name: t.name, annotations: t.annotations, scopes: t.securitySchemes[0].scopes })) }, null, 2));
else console.log(out.join("\n"));
process.exit(problems.length ? 1 : 0);
