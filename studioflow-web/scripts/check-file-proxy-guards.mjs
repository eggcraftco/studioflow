// The /f/ file viewer's two guards, driven as shipped.
//
//   npm run test:file-proxy
//
// What this exists to catch, in one sentence each:
//
//   1. The bucket allowlist has to live in TWO files, because firebase.json ships
//      only `functions/` and the web ships only `studioflow-web`, so neither bundle
//      can import the other's module. Two copies drift. This loads BOTH SHIPPED
//      MODULES and fails when their lists differ — it does not hold a third list
//      of its own to compare them against.
//   2. The stream bounds have to be exercised, not read. A content-length can be
//      absent and it can lie, so the byte counter is the only one of the three
//      bounds that makes the cap true, and it is the one worth running.
//
// Everything under test is imported or read from the file that ships. The one
// thing written out here is the OLD shape test, and only as a witness that the
// inputs below are the ones production used to accept — never as the thing under
// test. Compiled with the project's own TypeScript, following the pattern in
// check-finance-vectors.mjs, because studioflow-web has no test runner.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");

const webGuardsPath = path.join(webRoot, "lib", "studioflow", "fileProxyGuards.ts");
const functionsGuardsPath = path.join(repoRoot, "functions", "security", "fileBuckets.js");
const routePath = path.join(webRoot, "app", "f", "[...slug]", "route.ts");
const functionsIndexPath = path.join(repoRoot, "functions", "index.js");
const storageRulesPath = path.join(repoRoot, "storage.rules");

let failures = 0;
let checks = 0;
function check(name, condition, detail) {
  checks += 1;
  if (condition) {
    console.log("PASS  ", name);
  } else {
    failures += 1;
    console.log("FAIL  ", name, detail ? `\n        ${detail}` : "");
  }
}

/** The body of a named function, signature to its matching closing brace. A byte
 *  window would miss a guard that moved a few lines; this reads the whole thing. */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Pushes bytes through the SHIPPED capBytes transform and reports what got out. */
async function pumpThroughCap(capBytes, limit, chunkSizes) {
  let cancelled = false;
  const source = new ReadableStream({
    start(controller) {
      for (const size of chunkSizes) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
    cancel() {
      cancelled = true;
    }
  });
  const reader = source.pipeThrough(capBytes(limit)).getReader();
  let delivered = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      delivered += value.byteLength;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    return { errored: false, delivered, cancelled };
  } catch {
    // The cancel travels back to the source asynchronously; give it a turn.
    await new Promise(resolve => setTimeout(resolve, 0));
    return { errored: true, delivered, cancelled };
  }
}

const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-file-proxy-"));
try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [webGuardsPath, "--outDir", outDir, "--module", "es2022", "--target", "es2022",
     "--moduleResolution", "bundler", "--lib", "es2022,dom", "--skipLibCheck"],
    { stdio: "inherit" }
  );

  const web = await import(pathToFileURL(path.join(outDir, "fileProxyGuards.js")).href);
  const fns = createRequire(import.meta.url)(functionsGuardsPath);

  const routeSource = readFileSync(routePath, "utf8");
  const functionsIndex = readFileSync(functionsIndexPath, "utf8");
  const storageRules = readFileSync(storageRulesPath, "utf8");

  // ---------------------------------------------------------------- the copies

  const webList = [...web.ALLOWED_FILE_BUCKETS];
  const fnsList = [...fns.ALLOWED_FILE_BUCKETS];
  check(
    "the two allowlists are identical",
    JSON.stringify([...webList].sort()) === JSON.stringify([...fnsList].sort()) && webList.length === fnsList.length,
    `web ${JSON.stringify(webList)} vs functions ${JSON.stringify(fnsList)}`
  );
  check(
    "the two allowlists are non-empty",
    webList.length > 0 && fnsList.length > 0
  );

  // ------------------------------------------------------------- what they let in

  const ours = ["eggcraft-studio.firebasestorage.app", "eggcraft-studio.appspot.com"];
  check(
    "both aliases of our own bucket are admitted by both copies",
    ours.every(bucket => web.isAllowedFileBucket(bucket) && fns.isAllowedFileBucket(bucket)),
    ours.map(bucket => `${bucket}: web=${web.isAllowedFileBucket(bucket)} fns=${fns.isAllowedFileBucket(bucket)}`).join(" | ")
  );
  check(
    "a legacy link's bucket alias is not treated as an expiry",
    web.isAllowedFileBucket("eggcraft-studio.appspot.com") && fns.isAllowedFileBucket("eggcraft-studio.appspot.com")
  );

  // The exact bucket the production probes proved we accepted, plus the shapes a
  // narrower reading of "ours" would miss. The old pattern is quoted here ONLY to
  // show that every one of these was live — it is not what is being tested.
  const OLD_SHAPE_TEST = /^[a-z0-9._-]+\.(appspot\.com|firebasestorage\.app)$/i;
  const foreign = [
    "nivadesk-probe-not-a-real-project.appspot.com",
    "attacker-project.firebasestorage.app",
    "eggcraft-studio-evil.firebasestorage.app",
    "evil-eggcraft-studio.appspot.com"
  ];
  check(
    "every foreign-bucket case here was admitted by the shape test it replaces",
    foreign.every(bucket => OLD_SHAPE_TEST.test(bucket)),
    "a case the old code already refused would prove nothing"
  );
  check(
    "a foreign Firebase bucket is refused by both copies",
    foreign.every(bucket => !web.isAllowedFileBucket(bucket) && !fns.isAllowedFileBucket(bucket)),
    foreign.map(bucket => `${bucket}: web=${web.isAllowedFileBucket(bucket)} fns=${fns.isAllowedFileBucket(bucket)}`).join(" | ")
  );
  const notBuckets = ["", "   ", "eggcraft-studio.firebasestorage.app.evil.com", "evil.com/eggcraft-studio.appspot.com", "eggcraft-studio"];
  check(
    "a bucket that merely contains our name is refused by both copies",
    notBuckets.every(bucket => !web.isAllowedFileBucket(bucket) && !fns.isAllowedFileBucket(bucket)),
    notBuckets.map(bucket => `${JSON.stringify(bucket)}: web=${web.isAllowedFileBucket(bucket)} fns=${fns.isAllowedFileBucket(bucket)}`).join(" | ")
  );

  // ------------------------------------------------------------- the stream bounds

  check(
    "the byte cap matches the ceiling storage.rules enforces on upload",
    /request\.resource\.size\s*<=\s*210\s*\*\s*1024\s*\*\s*1024/.test(storageRules)
      && web.MAX_PROXY_BYTES === 210 * 1024 * 1024,
    `MAX_PROXY_BYTES=${web.MAX_PROXY_BYTES}; storage.rules safeUploadSize() is the source of the number`
  );
  check(
    "the deadline clears a full-size file at a plausible rate",
    web.PROXY_DEADLINE_MS > 0 && web.MAX_PROXY_BYTES / (web.PROXY_DEADLINE_MS / 1000) < 512 * 1024,
    `implies ${Math.round(web.MAX_PROXY_BYTES / (web.PROXY_DEADLINE_MS / 1000) / 1024)} KB/s floor`
  );

  check(
    "an over-cap content-length is refused",
    web.declaredLengthExceedsCap(String(web.MAX_PROXY_BYTES + 1), web.MAX_PROXY_BYTES) === true
      && web.declaredLengthExceedsCap("1e99", web.MAX_PROXY_BYTES) === true
  );
  check(
    "an at-cap content-length is allowed",
    web.declaredLengthExceedsCap(String(web.MAX_PROXY_BYTES), web.MAX_PROXY_BYTES) === false
  );
  check(
    "an absent or unparseable content-length is not itself a refusal",
    web.declaredLengthExceedsCap(null, web.MAX_PROXY_BYTES) === false
      && web.declaredLengthExceedsCap("", web.MAX_PROXY_BYTES) === false
      && web.declaredLengthExceedsCap("not-a-number", web.MAX_PROXY_BYTES) === false,
    "that case belongs to the byte counter, not to this check"
  );

  const overrun = await pumpThroughCap(web.capBytes, 1000, [400, 400, 400, 400]);
  check(
    "a stream with no content-length is cut at the cap",
    overrun.errored === true && overrun.delivered <= 1000,
    `errored=${overrun.errored} delivered=${overrun.delivered}`
  );
  check(
    "the cut cancels the upstream body rather than just truncating ours",
    overrun.cancelled === true,
    "the transfer must stop, not merely stop being forwarded"
  );
  // A lie is worse than a silence: the header check waves it through, so the
  // counter is the only thing standing between it and the cap. Both halves here.
  const lied = await pumpThroughCap(web.capBytes, 1000, [900, 900, 900]);
  check(
    "a content-length that lies under the cap is still cut at the cap",
    web.declaredLengthExceedsCap("10", 1000) === false && lied.errored === true && lied.delivered <= 1000,
    `header allowed it; counter delivered=${lied.delivered} errored=${lied.errored}`
  );
  const exact = await pumpThroughCap(web.capBytes, 1000, [500, 500]);
  check(
    "a stream exactly at the cap is delivered whole",
    exact.errored === false && exact.delivered === 1000,
    `errored=${exact.errored} delivered=${exact.delivered}`
  );

  // ------------------------------------------------------- the guards are wired in

  check(
    "the /f/ route imports the shared guards",
    /from\s+"@\/lib\/studioflow\/fileProxyGuards"/.test(routeSource)
  );
  check(
    "the /f/ route has no bucket shape test left",
    !/appspot\\\.com|BUCKET_PATTERN/.test(routeSource),
    "a second, looser bucket test in this file would be the whole finding again"
  );
  check(
    "the /f/ route gates the caller-supplied bucket on identity",
    /if\s*\(!isAllowedFileBucket\(bucket\)\)\s*return errorPage\(/.test(routeSource)
  );
  check(
    "a refused bucket is worded exactly like an expired link",
    /if \(!isAllowedFileBucket\(bucket\)\) return errorPage\("This file link is invalid or has expired\./.test(routeSource)
      && !/errorPage\("[^"]*bucket[^"]*"/i.test(routeSource),
    "the caller must not learn why the link was refused"
  );
  check(
    "the download fetch carries an abort deadline",
    /fetch\(fileUrl,\s*\{[^}]*signal:\s*AbortSignal\.timeout\(PROXY_DEADLINE_MS\)/.test(routeSource)
  );
  check(
    "the download stream is piped through the byte counter",
    /pipeThrough\(capBytes\(MAX_PROXY_BYTES\)\)/.test(routeSource)
  );
  check(
    "the download refuses an over-cap declared length",
    /declaredLengthExceedsCap\(upstream\.headers\.get\("content-length"\),\s*MAX_PROXY_BYTES\)/.test(routeSource)
  );

  const parser = functionBody(functionsIndex, "function nvParseFirebaseStorageUrl(");
  check(
    "nvParseFirebaseStorageUrl is still where the short-link bucket is read",
    parser !== null
  );
  check(
    "nvParseFirebaseStorageUrl refuses a bucket that is not ours",
    parser !== null && /isAllowedFileBucket\(bucket\)/.test(parser),
    "without this the abuse moves from ?b= to the short /f/<id> form"
  );
  check(
    "functions/index.js takes the guard from the shipped module",
    /require\("\.\/security\/fileBuckets"\)/.test(functionsIndex),
    "a locally retyped list is the divergence this suite exists to stop"
  );

  if (failures) {
    console.log(`\n❌ ${failures} of ${checks} file-proxy checks failed`);
    process.exit(1);
  }
  console.log(`\n✅ FILE PROXY GUARDS GEÇTİ (${checks} kontrol)`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
