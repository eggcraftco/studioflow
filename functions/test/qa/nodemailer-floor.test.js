// The nodemailer floor: 9.1.1 or newer, in the manifest, in the lockfile and
// in what actually resolves at runtime.
//
// GHSA-2x7j-588g-ccc2 (address-parser O(n²), < 9.1.0) and three moderates ride
// one npm audit entry; 9.1.1 clears all four (docs/openai-resubmission-package-
// 2026-09-10.md §2a). The manifest and the lockfile were fixed on 10 September
// 2026, and a deploy installs from the lockfile — but a checkout whose
// node_modules predates the fix keeps running 9.0.1 locally and every suite in
// this directory would pass on it without noticing. This check notices: it
// fails on a stale install and says what to run.
//
// Run: node test/qa/nodemailer-floor.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const FLOOR = [9, 1, 1];
const FUNCTIONS = path.join(__dirname, "..", "..");
function pass(name) { console.log("PASS ", name); }
function parse(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ""));
  assert.ok(m, `not a version: ${version}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function atLeast(a, b) { for (let i = 0; i < 3; i += 1) { if (a[i] !== b[i]) return a[i] > b[i]; } return true; }

// 1. The manifest cannot resolve below the floor.
{
  const manifest = JSON.parse(fs.readFileSync(path.join(FUNCTIONS, "package.json"), "utf8"));
  const range = String(manifest.dependencies.nodemailer || "");
  const m = /^\^?(\d+\.\d+\.\d+)$/.exec(range);
  assert.ok(m, `functions/package.json pins nodemailer as "${range}"; expected a caret or exact version`);
  assert.ok(atLeast(parse(m[1]), FLOOR), `functions/package.json allows nodemailer ${range}, below 9.1.1`);
  pass(`the manifest's nodemailer range (${range}) starts at or above 9.1.1`);
}

// 2. The lockfile — what a deploy installs — is at or above the floor.
{
  const lock = JSON.parse(fs.readFileSync(path.join(FUNCTIONS, "package-lock.json"), "utf8"));
  const entry = lock.packages && lock.packages["node_modules/nodemailer"];
  assert.ok(entry && entry.version, "package-lock.json has no node_modules/nodemailer entry");
  assert.ok(atLeast(parse(entry.version), FLOOR), `package-lock.json resolves nodemailer to ${entry.version}, below 9.1.1`);
  assert.ok(!entry.dependencies || Object.keys(entry.dependencies).length === 0, "nodemailer grew dependencies; the narrow-bump argument in §2a no longer holds");
  pass(`the lockfile resolves nodemailer to ${entry.version}`);
}

// 3. What this process would actually load. A stale node_modules is the case
//    this check exists for, so the message says what to do.
{
  const resolved = require.resolve("nodemailer/package.json");
  const installed = JSON.parse(fs.readFileSync(resolved, "utf8")).version;
  assert.ok(atLeast(parse(installed), FLOOR),
    `the installed nodemailer is ${installed} (${resolved}); the lockfile says 9.1.1 or newer. ` +
    "This node_modules predates the fix — run `npm ci` in functions/ (a deploy installs from the lockfile and is not affected).");
  pass(`the installed nodemailer (${installed}) is at or above the floor`);
}

console.log("\n✅ NODEMAILER FLOOR GEÇTİ");
