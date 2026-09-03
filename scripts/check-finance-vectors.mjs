// Runs the Finance Engine's golden vectors through the web's mirror.
//
// The web shows the block the server stamped, but it also has to compute the
// same figures while somebody is typing. Two implementations of the same
// arithmetic drift, quietly, and the drift shows up as a number that jumps when
// the server's answer lands. This is what stops that: the SAME vector file the
// server test uses, run through lib/studioflow/financeEngine.ts.
//
//   npm run test:finance
//
// Compiled with the project's own TypeScript rather than a test runner the
// project does not have.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");
const mirror = path.join(webRoot, "lib", "studioflow", "financeEngine.ts");
const vectorsPath = path.join(repoRoot, "functions", "finance", "vectors.json");

const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-finance-"));
try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [mirror, "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
    { stdio: "inherit" }
  );

  const compiled = pathToFileURL(path.join(outDir, "financeEngine.js")).href;
  const { computeOrderFinance, FINANCE_ENGINE_VERSION } = await import(compiled);
  const vectors = JSON.parse(readFileSync(vectorsPath, "utf8"));

  if (vectors.engineVersion !== FINANCE_ENGINE_VERSION) {
    console.error(`the mirror is version ${FINANCE_ENGINE_VERSION} and the vectors are ${vectors.engineVersion}`);
    process.exit(1);
  }

  let failures = 0;
  for (const testCase of vectors.cases) {
    const result = computeOrderFinance(testCase.order, testCase.settings, testCase.options || {});
    const wrong = [];
    for (const [field, expected] of Object.entries(testCase.expect)) {
      const actual = result[field];
      if (Array.isArray(expected)) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) wrong.push(`${field}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      } else if (typeof expected === "number") {
        if (!(Math.abs(Number(actual) - expected) < 0.005)) wrong.push(`${field}: ${actual} != ${expected}`);
      } else if (actual !== expected) {
        wrong.push(`${field}: ${actual} != ${expected}`);
      }
    }
    if (wrong.length) {
      failures += 1;
      console.log("FAIL ", testCase.name, "\n       ", wrong.join("\n        "));
    } else {
      console.log("PASS ", testCase.name);
    }
  }

  if (failures) {
    console.log(`\n❌ ${failures} of ${vectors.cases.length} vectors differ between the server engine and the web mirror`);
    process.exit(1);
  }
  console.log(`\n✅ WEB FINANCE MIRROR GEÇTİ (${vectors.cases.length} vektör)`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
