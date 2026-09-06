#!/usr/bin/env node
// Dependency audit gate — the CI half of DPP 2.7 (docs/security/vulnerability-management.md).
//
// Runs `npm audit --json` in every package tree and applies the policy in
// docs/security/audit-allowlist.json:
//   critical  → always fails
//   high      → fails unless allow-listed for this tree, and the entry's due date has not passed
//   moderate  → reported, never gated (they need major bumps; see the backlog)
//
// `npm audit` reads package-lock.json and asks the registry; it needs no
// node_modules, so this runs in seconds. The report is written to
// audit-report/ (one JSON per tree plus summary.md) for the evidence pack.
//
//   node scripts/audit-gate.mjs            # gate + report
//   AUDIT_GATE_TODAY=2026-10-06 node …     # simulate a later date (due-date check)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TREES = ["functions", "functions-amazon", "studioflow-web"];
const today = process.env.AUDIT_GATE_TODAY || new Date().toISOString().slice(0, 10);
const allowlist = JSON.parse(readFileSync(resolve(root, "docs/security/audit-allowlist.json"), "utf8"));
const allowed = new Map(allowlist.entries.map((e) => [`${e.tree}:${e.advisory}`, e]));
const reportDir = resolve(root, "audit-report");
mkdirSync(reportDir, { recursive: true });

function runAudit(tree) {
  const cwd = resolve(root, tree);
  if (!existsSync(resolve(cwd, "package-lock.json"))) throw new Error(`${tree}: no package-lock.json`);
  let out = "";
  try {
    out = execFileSync("npm", ["audit", "--json"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    // npm exits non-zero whenever it finds anything; the JSON is still on stdout.
    out = String(error.stdout || "");
    if (!out.trim()) throw error;
  }
  return JSON.parse(out);
}

const lines = [`# Dependency audit — ${today}`, ""];
const failures = [];
const summary = {};

for (const tree of TREES) {
  const audit = runAudit(tree);
  const counts = audit?.metadata?.vulnerabilities || {};
  const advisories = [];
  for (const [pkg, v] of Object.entries(audit?.vulnerabilities || {})) {
    for (const via of v.via || []) {
      if (typeof via !== "object") continue; // a string is a transitive pointer to another package
      const id = String(via.url || "").split("/").pop() || String(via.source || "");
      advisories.push({ package: pkg, severity: via.severity, advisory: id, title: via.title, range: via.range, fixAvailable: v.fixAvailable });
    }
  }
  const gated = advisories.filter((a) => a.severity === "critical" || a.severity === "high");
  const verdicts = gated.map((a) => {
    if (a.severity === "critical") return { ...a, verdict: "FAIL", why: "critical advisories are never allowed" };
    const entry = allowed.get(`${tree}:${a.advisory}`);
    if (!entry) return { ...a, verdict: "FAIL", why: "high advisory with no allow-list entry" };
    if (entry.due < today) return { ...a, verdict: "FAIL", why: `allow-listed but past due (${entry.due}); fix: ${entry.fix}` };
    return { ...a, verdict: "ALLOWED", why: `until ${entry.due}; fix: ${entry.fix}` };
  });
  failures.push(...verdicts.filter((v) => v.verdict === "FAIL").map((v) => ({ tree, ...v })));
  summary[tree] = { counts, gated: verdicts };
  writeFileSync(resolve(reportDir, `${tree}.json`), JSON.stringify({ tree, today, counts, advisories, gated: verdicts }, null, 2));

  lines.push(`## ${tree}`, "", `critical ${counts.critical || 0} · high ${counts.high || 0} · moderate ${counts.moderate || 0} · low ${counts.low || 0}`, "");
  if (verdicts.length) {
    lines.push("| Severity | Package | Advisory | Verdict | Note |", "|---|---|---|---|---|");
    for (const v of verdicts) lines.push(`| ${v.severity} | ${v.package} | ${v.advisory} | ${v.verdict} | ${v.why} |`);
    lines.push("");
  } else {
    lines.push("No high or critical advisories.", "");
  }
}

const verdict = failures.length ? "FAIL" : "PASS";
lines.push(`**Gate: ${verdict}** — ${failures.length} blocking finding(s). Moderate and low advisories are tracked in docs/security/vulnerability-management.md, not gated here.`);
const md = lines.join("\n");
writeFileSync(resolve(reportDir, "summary.md"), md + "\n");
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
process.exit(failures.length ? 1 : 0);
