// Deterministic checks for lib/studioflow/workspaceResolution.ts: a read that
// did not reach the server never becomes "open the personal workspace" and is
// never written back. Same scenarios as scripts/workspace-resolution/main.swift
// and the Android WorkspaceResolutionTest.
//
//   npm run test:workspace
//
// Compiled with the project's own TypeScript rather than a test runner the
// project does not have (same shape as check-finance-vectors.mjs).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const source = path.join(webRoot, "lib", "studioflow", "workspaceResolution.ts");

const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-workspace-"));
let failures = 0;
function expect(name, ok) {
  if (ok) console.log(`ok   ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [source, "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
    { stdio: "inherit" },
  );
  const mod = await import(pathToFileURL(path.join(outDir, "workspaceResolution.js")).href);
  const { preferredWorkspace, decideWorkspace, workspaceResultApplies } = mod;
  const uid = "user-1";
  const team = "team-9";

  // 1. A read error changes nothing.
  expect("stored read failed → retry", same(preferredWorkspace(uid, { kind: "failed" }), { kind: "retry", reason: "stored-workspace-unavailable" }));
  expect(
    "company read unavailable → retry, never personal",
    same(decideWorkspace(uid, { kind: "check", companyId: team, persistIfPersonal: false }, "unavailable"), { kind: "retry", reason: "workspace-unavailable" }),
  );
  expect("cache-only empty stored value → retry (not first setup)", same(preferredWorkspace(uid, { kind: "cache", activeCompanyId: "" }), { kind: "retry", reason: "stored-workspace-unavailable" }));

  // 2. Retry with a good read opens the stored workspace, without writing.
  expect(
    "retry after a good read → team workspace, no write",
    same(decideWorkspace(uid, preferredWorkspace(uid, { kind: "server", activeCompanyId: team }), "granted"), { kind: "activate", companyId: team, persist: false }),
  );

  // 3. Explicit choice keeps working: granted → activate.
  expect(
    "explicit switch, access granted → activate",
    same(decideWorkspace(uid, { kind: "check", companyId: team, persistIfPersonal: false }, "granted"), { kind: "activate", companyId: team, persist: false }),
  );

  // 4. First setup (server-confirmed empty) → personal, recorded; a stored personal id is not re-written.
  expect(
    "first setup → personal, persisted",
    same(decideWorkspace(uid, preferredWorkspace(uid, { kind: "server", activeCompanyId: null }), "unavailable"), { kind: "activate", companyId: uid, persist: true }),
  );
  expect(
    "stored personal id → personal, not re-written",
    same(decideWorkspace(uid, preferredWorkspace(uid, { kind: "server", activeCompanyId: uid }), "unavailable"), { kind: "activate", companyId: uid, persist: false }),
  );

  // 5. Server-confirmed loss of access is shown, not acted on.
  expect(
    "access denied by the server → access-lost",
    same(decideWorkspace(uid, { kind: "check", companyId: team, persistIfPersonal: false }, "denied"), { kind: "access-lost", companyId: team }),
  );

  // 6. A late result from another account or load is not applied.
  expect("same account, same generation → applies", workspaceResultApplies(uid, 3, uid, 3));
  expect("account changed → not applied", !workspaceResultApplies(uid, 3, "user-2", 4));
  expect("signed out → not applied", !workspaceResultApplies(uid, 3, null, 4));
  expect("new load generation → not applied", !workspaceResultApplies(uid, 3, uid, 4));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(failures === 0 ? "workspace-resolution: all checks passed" : `workspace-resolution: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
