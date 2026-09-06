#!/usr/bin/env node
/**
 * Re-runnable production-parity harness for the MCP `tools/list` listing.
 *
 * Why it exists: the operator's 1.2.0 invariant is "flags OFF -> production
 * 1.1.1 behaviour unchanged". This script is how that claim is checked against
 * the tree that is actually deployed, rather than against a fixture recorded
 * somewhere on the branch.
 *
 * What it does, for each of two commits:
 *   1. `git archive <commit> functions` into a scratch directory (never a
 *      checkout, so the working tree is untouched and this stays read-only);
 *   2. symlinks the repo's functions/node_modules into it;
 *   3. requires index.js with EVERY environment variable whose name contains
 *      "MCP" deleted -- production carries no MCP env entry at all, so "unset"
 *      is the faithful state, not "0";
 *   4. calls the listing builder and writes the result.
 *
 * The baseline commit does not export the builder (it is module-local there),
 * so the harness appends a one-line export shim to the SCRATCH COPY only. The
 * pristine sha256 is recorded in each snapshot's `meta` so the shim can be
 * shown not to have altered the source that produced the listing.
 *
 * Usage:
 *   node docs/evidence/capture-tools-list.js            # verify against committed snapshots
 *   node docs/evidence/capture-tools-list.js --write    # regenerate the snapshots
 */
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const EVIDENCE = __dirname;
const WRITE = process.argv.includes("--write");

/** The deployed tree. Ground truth, measured 6 Sep 2026 -- see the header of
 *  docs/mcp-production-parity.md for how each of these was established. */
const PRODUCTION = {
  commit: "015d5792",
  file: "tools-list-production-015d5792.json",
  label: "production (Cloud Run revision chatgptmcp-00071-tir)"
};
const CANDIDATE = {
  commit: "56b6591c",
  file: "tools-list-candidate-56b6591c-flags-off.json",
  label: "mcp-orchestration HEAD, all MCP flags unset"
};

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function capture(commit) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `nv-parity-${commit}-`));
  execFileSync("/bin/sh", ["-c",
    `git -C ${JSON.stringify(REPO)} archive ${commit} functions | tar -x -C ${JSON.stringify(scratch)}`]);

  const functionsDir = path.join(scratch, "functions");
  fs.symlinkSync(path.join(REPO, "functions", "node_modules"), path.join(functionsDir, "node_modules"));

  const indexPath = path.join(functionsDir, "index.js");
  const pristineSha = sha256(fs.readFileSync(indexPath));

  // Expose the builder if this commit keeps it module-local (the baseline does).
  const source = fs.readFileSync(indexPath, "utf8");
  const shimmed = /exports\._nvMcpToolsWithSecuritySchemes/.test(source);
  if (!shimmed) {
    fs.appendFileSync(indexPath,
      "\n// [parity harness, scratch only]\nexports._nvMcpToolsWithSecuritySchemes = nvMcpToolsWithSecuritySchemes;\n");
  }

  const driver = `
    for (const k of Object.keys(process.env)) if (/MCP/.test(k)) delete process.env[k];
    const api = require(${JSON.stringify(indexPath)});
    process.stdout.write("<<<NVJSON>>>" + JSON.stringify(api._nvMcpToolsWithSecuritySchemes()) + "<<<END>>>");
  `;
  const raw = execFileSync(process.execPath, ["-e", driver], {
    cwd: functionsDir,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"]
  }).toString();

  const match = raw.match(/<<<NVJSON>>>([\s\S]*)<<<END>>>/);
  if (!match) throw new Error(`${commit}: the listing builder produced no output`);
  fs.rmSync(scratch, { recursive: true, force: true });

  return {
    tools: JSON.parse(match[1]),
    indexSha256: pristineSha,
    exportShimAppended: !shimmed
  };
}

let failed = false;
const results = {};

for (const target of [PRODUCTION, CANDIDATE]) {
  const captured = capture(target.commit);
  const snapshot = {
    meta: {
      what: "MCP tools/list, every MCP feature flag UNSET",
      source: target.label,
      commit: execFileSync("git", ["-C", REPO, "rev-parse", target.commit]).toString().trim(),
      "functions/index.js sha256 (pristine, before any harness shim)": captured.indexSha256,
      exportShimAppendedToScratchCopy: captured.exportShimAppended,
      toolCount: captured.tools.length,
      listingSha256: sha256(JSON.stringify(captured.tools)),
      regenerate: "node docs/evidence/capture-tools-list.js --write"
    },
    tools: captured.tools
  };
  results[target.commit] = snapshot;

  const dest = path.join(EVIDENCE, target.file);
  const serialized = JSON.stringify(snapshot, null, 2) + "\n";
  if (WRITE) {
    fs.writeFileSync(dest, serialized);
    console.log(`wrote  ${target.file}  (${captured.tools.length} tools, listing sha256 ${snapshot.meta.listingSha256.slice(0, 16)}...)`);
  } else {
    const onDisk = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : null;
    const ok = onDisk && JSON.stringify(onDisk.tools) === JSON.stringify(captured.tools);
    console.log(`${ok ? "PASS  " : "FAIL  "}${target.file} matches the committed snapshot`);
    if (!ok) failed = true;
  }
}

const prod = JSON.stringify(results[PRODUCTION.commit].tools);
const cand = JSON.stringify(results[CANDIDATE.commit].tools);
console.log("");
console.log(`production listing sha256 : ${sha256(prod)}`);
console.log(`candidate  listing sha256 : ${sha256(cand)}`);
console.log(prod === cand
  ? "VERDICT: the flags-off candidate listing is BYTE-IDENTICAL to production."
  : "VERDICT: the flags-off candidate listing DIFFERS from production.");

process.exit(failed ? 1 : 0);
