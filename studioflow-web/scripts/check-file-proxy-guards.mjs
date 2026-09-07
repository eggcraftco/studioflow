// The /f/ file viewer's guards, DRIVEN as shipped.
//
//   npm run test:file-proxy
//
// What this exists to catch, in one sentence each:
//
//   1. The bucket allowlist has to live in TWO files, because firebase.json ships
//      only `functions/` and the web ships only `studioflow-web`, so neither bundle
//      can import the other's module. Two copies drift. This loads BOTH SHIPPED
//      MODULES and fails when their lists differ.
//   2. The stream bounds have to be exercised, not read. A content-length can be
//      absent and it can lie, so the byte counter is the only one of the three
//      bounds that makes the cap true, and it is the one worth running.
//   3. The guards have to FIRE, in the shipped call sites, in the right order.
//      An earlier version of this file asserted the /f/ route and
//      nvParseFirebaseStorageUrl by regex over their source, which proves a line
//      EXISTS and not that it runs: the gate could be moved below the ?dl=1 branch,
//      or the parser's `return null` dropped while the call stayed, and every check
//      here stayed green. Both call sites are now invoked for real — the route's
//      exported GET with only the network stubbed, and the parser's own shipped
//      body — so what is asserted is refusal, not mention.
//
// THIS FILE DOES HOLD A REFERENCE LIST of our own buckets (OUR_PROJECT_BUCKETS
// below), deliberately and contrary to what the commit that introduced it said.
// Two copies agreeing with each other is not the property worth having — they can
// agree on a third party's bucket. What is asserted is that each shipped list is
// EXACTLY the two aliases of our project, so the drift this allowlist exists to
// prevent ("customer X asked to serve from their own bucket") cannot pass.
//
// Compiled with the project's own TypeScript, following the pattern in
// check-finance-vectors.mjs, because studioflow-web has no test runner.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

// Every check in this file is counted, and the total is pinned at the bottom. A
// runner that exits 0 having quietly skipped half its checks has happened in this
// repo before; a printed number nobody compares to anything does not stop it.
const EXPECTED_CHECKS = 52;

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

/** A handler's source from its `exports.` line to the next one. functionBody
 *  cannot be used on an onRequest/onCall export: the first brace after the
 *  signature is the options object, and it closes three lines later. */
function exportedHandlerSource(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const end = source.indexOf("\nexports.", start + signature.length);
  return source.slice(start, end > 0 ? end : source.length);
}

/** Pushes chunks through the SHIPPED capBytes transform and reports what got out.
 *  `limit` is passed through verbatim, so `undefined` exercises the parameter
 *  DEFAULT — which is the contract a second caller gets and is otherwise never run.
 *  Chunks may be plain `{ byteLength }` stand-ins: the transform only ever reads
 *  that property, so a 210 MB overrun can be proved without allocating 210 MB. */
async function pumpThroughCap(capBytes, limit, chunks) {
  let cancelled = false;
  const source = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "number" ? new Uint8Array(chunk) : chunk);
      }
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
  const srcDir = path.join(outDir, "src");
  const jsDir = path.join(outDir, "js");
  mkdirSync(srcDir, { recursive: true });

  const routeSource = readFileSync(routePath, "utf8");
  const functionsIndex = readFileSync(functionsIndexPath, "utf8");
  const storageRules = readFileSync(storageRulesPath, "utf8");

  // --------------------------------------------- the route, compiled and runnable
  //
  // TWO rewrites, and only two, so that what runs below is the shipped handler:
  //
  //   * `next/server` is dropped. NextRequest appears in exactly one type
  //     position and nowhere else, so nothing of the route's behaviour lives in
  //     it, and resolving it would need node_modules inside the temp dir.
  //   * the `@/...` alias becomes a relative specifier, because tsc is run over
  //     two loose files rather than over the Next project.
  //
  // Both are asserted to have applied. A silent no-op here would compile a file
  // that is not the one shipping, or not compile at all — either way the checks
  // that follow would be testing nothing, which is the failure mode this whole
  // rewrite exists to remove.
  const NEXT_IMPORT = 'import { NextRequest } from "next/server";';
  const NEXT_STUB =
    "type NextRequest = { nextUrl: { searchParams: URLSearchParams; pathname: string };" +
    " headers: { get(name: string): string | null } };";
  const ALIAS = '"@/lib/studioflow/fileProxyGuards"';
  const routeForRun = routeSource.replace(NEXT_IMPORT, NEXT_STUB).replace(ALIAS, '"./fileProxyGuards.js"');
  check(
    "the route harness compiles the shipped file, with only its two imports rewritten",
    routeSource.includes(NEXT_IMPORT) && routeSource.includes(ALIAS)
      && routeForRun.includes(NEXT_STUB) && routeForRun.includes('"./fileProxyGuards.js"')
      && !routeForRun.includes("next/server"),
    "if either rewrite stops applying, everything driven below is driving the wrong source"
  );

  writeFileSync(path.join(srcDir, "route.ts"), routeForRun);
  writeFileSync(path.join(srcDir, "fileProxyGuards.ts"), readFileSync(webGuardsPath, "utf8"));
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [path.join(srcDir, "route.ts"), path.join(srcDir, "fileProxyGuards.ts"),
     "--outDir", jsDir, "--module", "es2022", "--target", "es2022",
     "--moduleResolution", "bundler", "--lib", "es2022,dom", "--skipLibCheck", "--strict"],
    { stdio: "inherit" }
  );
  // The temp dir has no package.json above it, so `.js` would be read as CommonJS.
  writeFileSync(path.join(jsDir, "package.json"), JSON.stringify({ type: "module" }));

  const web = await import(pathToFileURL(path.join(jsDir, "fileProxyGuards.js")).href);
  const route = await import(pathToFileURL(path.join(jsDir, "route.js")).href);
  const fns = createRequire(import.meta.url)(functionsGuardsPath);

  // ---------------------------------------------------------------- the copies

  const webList = [...web.ALLOWED_FILE_BUCKETS];
  const fnsList = [...fns.ALLOWED_FILE_BUCKETS];
  check(
    "the two allowlists are identical",
    JSON.stringify([...webList].sort()) === JSON.stringify([...fnsList].sort()) && webList.length === fnsList.length,
    `web ${JSON.stringify(webList)} vs functions ${JSON.stringify(fnsList)}`
  );

  // The reference list. Two copies agreeing proves only that somebody edited both
  // — including both to admit a third party. This is what stops that.
  const OUR_PROJECT_BUCKETS = ["eggcraft-studio.firebasestorage.app", "eggcraft-studio.appspot.com"];
  const namesOnlyOurProject = list =>
    list.length === OUR_PROJECT_BUCKETS.length && list.every(bucket => OUR_PROJECT_BUCKETS.includes(bucket));
  check(
    "each allowlist is exactly the two aliases of OUR project and nothing else",
    namesOnlyOurProject(webList) && namesOnlyOurProject(fnsList),
    `web ${JSON.stringify(webList)} | functions ${JSON.stringify(fnsList)} | expected ${JSON.stringify(OUR_PROJECT_BUCKETS)}`
  );
  check(
    "every entry in both lists is a bucket of the eggcraft-studio project",
    [...webList, ...fnsList].every(bucket => /^eggcraft-studio\.(firebasestorage\.app|appspot\.com)$/.test(bucket)),
    "a serve-from-the-customer's-own-bucket entry is the drift this list exists to prevent"
  );

  // ------------------------------------------------------------- what they let in

  check(
    "both aliases of our own bucket are admitted by both copies",
    OUR_PROJECT_BUCKETS.every(bucket => web.isAllowedFileBucket(bucket) && fns.isAllowedFileBucket(bucket)),
    OUR_PROJECT_BUCKETS.map(b => `${b}: web=${web.isAllowedFileBucket(b)} fns=${fns.isAllowedFileBucket(b)}`).join(" | ")
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
    foreign.map(b => `${b}: web=${web.isAllowedFileBucket(b)} fns=${fns.isAllowedFileBucket(b)}`).join(" | ")
  );
  const notBuckets = ["", "   ", "eggcraft-studio.firebasestorage.app.evil.com", "evil.com/eggcraft-studio.appspot.com", "eggcraft-studio"];
  check(
    "a bucket that merely contains our name is refused by both copies",
    notBuckets.every(bucket => !web.isAllowedFileBucket(bucket) && !fns.isAllowedFileBucket(bucket)),
    notBuckets.map(b => `${JSON.stringify(b)}: web=${web.isAllowedFileBucket(b)} fns=${fns.isAllowedFileBucket(b)}`).join(" | ")
  );

  // ----------------------------------------------- checked value = used value
  //
  // The guard normalises (trim + lowercase) to compare. If callers then use their
  // own spelling, the guard is checking a string nobody uses. It does not reach a
  // foreign bucket — GCS bucket names are lowercase-only, so a case-drifted
  // spelling names our bucket or nothing — but a padded one used to be written
  // into a fileShares row verbatim, and every link built from it 404s for ever.
  const drifted = [
    ["EGGCRAFT-STUDIO.APPSPOT.COM", "eggcraft-studio.appspot.com"],
    ["Eggcraft-Studio.Appspot.Com", "eggcraft-studio.appspot.com"],
    ["  eggcraft-studio.firebasestorage.app  ", "eggcraft-studio.firebasestorage.app"],
    ["\teggcraft-studio.appspot.com\n", "eggcraft-studio.appspot.com"]
  ];
  check(
    "the guard hands back the spelling it matched, not the caller's",
    drifted.every(([input, want]) => web.canonicalFileBucket(input) === want && fns.canonicalFileBucket(input) === want),
    drifted.map(([i, w]) => `${JSON.stringify(i)} -> web=${JSON.stringify(web.canonicalFileBucket(i))} fns=${JSON.stringify(fns.canonicalFileBucket(i))} want ${w}`).join(" | ")
  );
  check(
    "a bucket that is not ours canonicalises to null in both copies",
    [...foreign, ...notBuckets, null, undefined].every(bucket =>
      web.canonicalFileBucket(bucket) === null && fns.canonicalFileBucket(bucket) === null)
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
  // Both guards take the limit as an optional parameter, and both call sites in
  // route.ts pass it explicitly — so the DEFAULT, which is what a second caller
  // gets, is otherwise never run. It is part of the module's contract; an
  // unbounded default would be an unbounded second caller.
  check(
    "declaredLengthExceedsCap's own default is the cap, not infinity",
    web.declaredLengthExceedsCap(String(web.MAX_PROXY_BYTES + 1)) === true
      && web.declaredLengthExceedsCap(String(web.MAX_PROXY_BYTES)) === false,
    "called with one argument, as a second caller would"
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
  const defaulted = await pumpThroughCap(web.capBytes, undefined, [
    { byteLength: web.MAX_PROXY_BYTES }, { byteLength: 1 }
  ]);
  check(
    "capBytes' own default is the cap, not infinity",
    defaulted.errored === true && defaulted.delivered <= web.MAX_PROXY_BYTES,
    `called with no argument; errored=${defaulted.errored} delivered=${defaulted.delivered}`
  );
  const defaultedAtCap = await pumpThroughCap(web.capBytes, undefined, [{ byteLength: web.MAX_PROXY_BYTES }]);
  check(
    "the default cap still delivers a stream exactly at the ceiling",
    defaultedAtCap.errored === false && defaultedAtCap.delivered === web.MAX_PROXY_BYTES,
    "an off-by-one default would refuse the largest file the product accepts"
  );

  // ------------------------------------------------- the route, actually invoked
  //
  // Everything from here down calls the shipped GET. Only the network is stubbed:
  // every fetch the handler makes is recorded, so "the gate runs BEFORE the bytes
  // are fetched" is proved by there being no outbound request at all, rather than
  // by the gate's line number. Moving the gate below the ?dl=1 branch — the exact
  // regression the old text-presence check could not see — turns these red.

  const FUNCTIONS_HOST = "europe-west2-eggcraft-studio.cloudfunctions.net";
  const realFetch = globalThis.fetch;
  let calls = [];

  function bodyOf(bytes) {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      }
    });
  }
  function upstreamResponse({ status = 200, headers = {}, bytes = 8 } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: name => headers[name.toLowerCase()] ?? null },
      body: bodyOf(bytes)
    };
  }
  /** Answers nvViewSharedFile?meta=1 with a fileShares row, and any storage URL
   *  with bytes. `row` is what the function hands back — i.e. what is IN Firestore. */
  function network({ row, upstream = () => upstreamResponse() } = {}) {
    return async (url, init) => {
      const asString = String(url);
      calls.push({ url: asString, init });
      if (asString.includes(FUNCTIONS_HOST)) {
        if (row === undefined) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
        return { ok: true, status: 200, json: async () => row, text: async () => "<html>viewer</html>" };
      }
      return upstream(asString, init);
    };
  }
  async function get(url, { row, upstream, headers = {} } = {}) {
    const parsed = new URL(url, "https://nivadesk.app");
    const slug = parsed.pathname.replace(/^\/f\//, "").split("/").filter(Boolean);
    calls = [];
    globalThis.fetch = network({ row, upstream });
    try {
      const response = await route.GET(
        {
          nextUrl: { searchParams: parsed.searchParams, pathname: parsed.pathname },
          headers: { get: name => headers[name.toLowerCase()] ?? null }
        },
        { params: Promise.resolve({ slug }) }
      );
      return { status: response.status, headers: response.headers, text: await response.text(), calls };
    } finally {
      globalThis.fetch = realFetch;
    }
  }
  const storageCalls = made => made.filter(call => call.url.includes("firebasestorage.googleapis.com"));

  const OURS = "eggcraft-studio.firebasestorage.app";
  const FOREIGN = "attacker-project.firebasestorage.app";

  // ---- the caller-supplied bucket

  const longForeignView = await get(`/f/companies/c1/a.png?b=${FOREIGN}&t=tok`);
  check(
    "a foreign ?b= is refused and never reaches the viewer HTML",
    longForeignView.status === 400 && !longForeignView.text.includes(FOREIGN)
      && storageCalls(longForeignView.calls).length === 0,
    `status=${longForeignView.status} storageCalls=${storageCalls(longForeignView.calls).length}`
  );
  const longForeignDownload = await get(`/f/companies/c1/a.png?b=${FOREIGN}&t=tok&dl=1`);
  check(
    "a foreign ?b= is refused BEFORE a byte is fetched, on the ?dl=1 path too",
    longForeignDownload.status === 400 && storageCalls(longForeignDownload.calls).length === 0,
    `status=${longForeignDownload.status} storage fetches=${JSON.stringify(storageCalls(longForeignDownload.calls).map(c => c.url))}`
  );
  check(
    "a refused bucket is worded exactly like an expired link",
    /invalid or has expired/.test(longForeignView.text) && !/bucket/i.test(longForeignView.text),
    "the caller must not learn why the link was refused"
  );
  const longOurs = await get(`/f/companies/c1/a.png?b=${OURS}&t=tok`);
  check(
    "our own bucket is still served",
    longOurs.status === 200 && longOurs.text.includes(`/v0/b/${OURS}/o/`),
    `status=${longOurs.status}`
  );
  const longLegacy = await get("/f/companies/c1/a.png?b=eggcraft-studio.appspot.com&t=tok");
  check(
    "a legacy-alias link is served rather than read as an expiry",
    longLegacy.status === 200 && longLegacy.text.includes("/v0/b/eggcraft-studio.appspot.com/o/"),
    `status=${longLegacy.status}`
  );
  const drift = await get("/f/companies/c1/a.png?b=EGGCRAFT-STUDIO.APPSPOT.COM&t=tok");
  check(
    "the storage URL carries the allowlisted spelling, not the caller's",
    drift.status === 200 && drift.text.includes("/v0/b/eggcraft-studio.appspot.com/o/")
      && !drift.text.includes("EGGCRAFT-STUDIO.APPSPOT.COM"),
    `status=${drift.status}`
  );

  // ---- the bucket that arrives from OUR OWN store
  //
  // The gate on the mint side is a WRITE gate: not retroactive, and shipped in a
  // different deploy from this route. A fileShares row carrying a foreign bucket
  // — planted before the gate, or in the window between the two deploys — is what
  // this pair is about. The stream bounds already covered this path; the origin
  // did not.

  const shortForeign = await get("/f/aB9xK2abc1?dl=1", {
    row: { ok: true, bucket: FOREIGN, path: "companies/c1/a.png", token: "tok", fileName: "a.png" }
  });
  check(
    "a fileShares row naming a foreign bucket is refused at READ time",
    shortForeign.status === 400 && storageCalls(shortForeign.calls).length === 0,
    `status=${shortForeign.status} storage fetches=${JSON.stringify(storageCalls(shortForeign.calls).map(c => c.url))}`
  );
  const shortNotABucket = await get("/f/aB9xK2abc1?dl=1", {
    row: { ok: true, bucket: "evil.com", path: "companies/c1/a.png", token: "tok", fileName: "a.png" }
  });
  check(
    "a stored value that is not a bucket at all is refused the same way",
    shortNotABucket.status === 400 && storageCalls(shortNotABucket.calls).length === 0,
    `status=${shortNotABucket.status}`
  );
  const shortOurs = await get("/f/aB9xK2abc1?dl=1", {
    row: { ok: true, bucket: OURS, path: "companies/c1/a.png", token: "tok", fileName: "a.png" }
  });
  check(
    "a short link naming our own bucket still downloads",
    shortOurs.status === 200 && storageCalls(shortOurs.calls).length === 1
      && storageCalls(shortOurs.calls)[0].url.includes(`/v0/b/${OURS}/o/`),
    `status=${shortOurs.status} storageCalls=${storageCalls(shortOurs.calls).length}`
  );
  check(
    "a short-link download is sent as an attachment, never rendered",
    /attachment; filename="a\.png"/.test(shortOurs.headers.get("content-disposition") || ""),
    shortOurs.headers.get("content-disposition") || "(absent)"
  );

  // ---- the bounds, through the handler rather than through the transform alone

  const declared = await get(`/f/companies/c1/big.bin?b=${OURS}&t=tok&dl=1`, {
    upstream: () => upstreamResponse({ headers: { "content-length": String(web.MAX_PROXY_BYTES + 1) } })
  });
  check(
    "the handler refuses an over-cap declared length",
    declared.status === 400,
    `status=${declared.status}`
  );
  const download = await get(`/f/companies/c1/a.png?b=${OURS}&t=tok&dl=1`, {
    upstream: () => upstreamResponse({ bytes: 16 })
  });
  check(
    "a within-cap download is delivered with an attachment header",
    download.status === 200 && /attachment; filename="a\.png"/.test(download.headers.get("content-disposition") || ""),
    `status=${download.status} cd=${download.headers.get("content-disposition")}`
  );
  const deadline = download.calls.find(call => call.url.includes("firebasestorage.googleapis.com"));
  check(
    "the download fetch carries an abort deadline",
    !!deadline && !!deadline.init && typeof deadline.init.signal === "object" && deadline.init.signal !== null,
    "no AbortSignal on the outbound request"
  );
  // Without redirect:"manual" the allowlist constrains where we ASK for bytes and
  // not where we READ them from: undici's default follows a 3xx to any origin and
  // that body would be served under our hostname with our attachment header.
  check(
    "the download fetch does not follow redirects",
    !!deadline && deadline.init.redirect === "manual",
    `redirect=${deadline && deadline.init ? JSON.stringify(deadline.init.redirect) : "(no init)"}`
  );
  const redirected = await get(`/f/companies/c1/a.png?b=${OURS}&t=tok&dl=1`, {
    upstream: () => upstreamResponse({ status: 302, headers: { location: "http://127.0.0.1:9/secret" } })
  });
  check(
    "a 3xx from the storage host is answered as a failure, not followed",
    redirected.status === 400,
    `status=${redirected.status}`
  );

  // ------------------------------------------------------- the route's own source

  check(
    "the /f/ route imports the shared guards",
    /from\s+"@\/lib\/studioflow\/fileProxyGuards"/.test(routeSource)
  );
  // Narrower than its old name claimed: this catches a bucket host suffix written
  // anywhere in the route, in a regex or in a plain string. The general property —
  // no test in this file admits a bucket that is not ours — is carried by the
  // driven checks above, which is where it belongs.
  check(
    "the /f/ route names no bucket host suffix of its own",
    !/appspot|firebasestorage\.app|BUCKET_PATTERN/.test(routeSource),
    "a second, looser bucket test in this file would be the whole finding again"
  );
  check(
    "the /f/ route holds no bucket list of its own",
    !new RegExp(OUR_PROJECT_BUCKETS.map(b => b.replace(/\./g, "\\.")).join("|")).test(routeSource),
    "the allowlist lives in one module per bundle, not in the call site"
  );

  // ----------------------------------------- the mint-side parser, actually invoked
  //
  // nvParseFirebaseStorageUrl is not exported, so its SHIPPED BODY is lifted out of
  // index.js and compiled here with the guard injected. The old check matched the
  // mere mention of the guard, which two dead-coded variants passed: `void
  // isAllowedFileBucket(bucket)` and `if (false && !isAllowedFileBucket(bucket))`.
  // What is asserted now is the refusal.

  const parserSource = functionBody(functionsIndex, "function nvParseFirebaseStorageUrl(");
  check(
    "nvParseFirebaseStorageUrl is still where the short-link bucket is read",
    parserSource !== null
  );
  let parse = null;
  try {
    parse = new Function("canonicalFileBucket", `${parserSource}\nreturn nvParseFirebaseStorageUrl;`)(fns.canonicalFileBucket);
  } catch (error) {
    parse = null;
    console.log("        parser would not compile:", error && error.message);
  }
  const parseOrNull = raw => {
    try { return parse(raw); } catch { return null; }
  };
  const storageUrl = (bucket, objectPath = "companies%2Fc1%2Fa.png") =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${objectPath}?alt=media&token=tok`;

  check(
    "the shipped parser body compiles against the shipped guard",
    typeof parse === "function",
    "it references something this harness does not supply — read the message above"
  );
  check(
    "nvParseFirebaseStorageUrl REFUSES a bucket that is not ours",
    parse !== null && [
      FOREIGN, "nivadesk-probe-not-a-real-project.appspot.com", "evil.com",
      "eggcraft-studio.firebasestorage.app.evil.com"
    ].every(bucket => parseOrNull(storageUrl(bucket)) === null),
    "without this the abuse moves from ?b= to the short /f/<id> form"
  );
  check(
    "nvParseFirebaseStorageUrl still accepts both aliases of our own bucket",
    parse !== null && OUR_PROJECT_BUCKETS.every(bucket => {
      const info = parseOrNull(storageUrl(bucket));
      return info && info.bucket === bucket && info.storagePath === "companies/c1/a.png" && info.token === "tok";
    }),
    "refusing our own links would read to a customer as an expiry"
  );
  check(
    "nvParseFirebaseStorageUrl stores the allowlisted spelling, not the URL's",
    parse !== null
      && (parseOrNull(storageUrl("%20eggcraft-studio.appspot.com")) || {}).bucket === "eggcraft-studio.appspot.com"
      && (parseOrNull(storageUrl("%09eggcraft-studio.appspot.com%0A")) || {}).bucket === "eggcraft-studio.appspot.com"
      && (parseOrNull(storageUrl("EGGCRAFT-STUDIO.APPSPOT.COM")) || {}).bucket === "eggcraft-studio.appspot.com",
    "a padded spelling used to be written into the row, and every link from it 404s for ever"
  );
  check(
    "nvParseFirebaseStorageUrl still pins the host and requires a token",
    parse !== null
      && parseOrNull(`https://evil.com/v0/b/${OURS}/o/a.png?token=tok`) === null
      && parseOrNull(`https://firebasestorage.googleapis.com/v0/b/${OURS}/o/a.png`) === null
      && parseOrNull(`https://firebasestorage.googleapis.com/nope`) === null,
    "the bucket check is added to those, not instead of them"
  );

  // --------------------------------- the other reader of a fileShares row
  //
  // nvViewSharedFile cannot be driven from here — it is an onRequest handler over
  // admin.firestore(). Asserted by index order in the style of
  // functions/test/qa/shared-links.test.js, which is weaker than invocation and is
  // the reason the web-side read gate above is driven for real: that one covers
  // the same row on the path that actually proxies bytes.
  const viewer = exportedHandlerSource(functionsIndex, "exports.nvViewSharedFile = onRequest(");
  check(
    "nvViewSharedFile is still the server-side resolver for a short link",
    viewer !== null && viewer.length > 400
  );
  check(
    "nvViewSharedFile canonicalises the STORED bucket before it builds a URL",
    viewer !== null
      && /const bucket = canonicalFileBucket\(data\.bucket\);/.test(viewer)
      && /if \(!bucket\) \{/.test(viewer)
      && viewer.indexOf("canonicalFileBucket(data.bucket)") < viewer.indexOf("firebasestorage.googleapis.com"),
    "a write-time gate is not retroactive; the row has to be checked where it is read"
  );
  check(
    "nvViewSharedFile hands out the checked value, never data.bucket",
    viewer !== null
      && !/encodeURIComponent\(data\.bucket\)/.test(viewer)
      && !/bucket: String\(data\.bucket\)/.test(viewer),
    "checking one string and serving another is the split this whole file is about"
  );
  check(
    "functions/index.js takes the guard from the shipped module",
    /require\("\.\/security\/fileBuckets"\)/.test(functionsIndex),
    "a locally retyped list is the divergence this suite exists to stop"
  );

  // ------------------------------------------------------------------- the count

  check(
    "every check in this file ran",
    checks + 1 === EXPECTED_CHECKS,
    `ran ${checks + 1}, expected ${EXPECTED_CHECKS} — update EXPECTED_CHECKS deliberately, never to make this green`
  );

  if (failures) {
    console.log(`\n❌ ${failures} of ${checks} file-proxy checks failed`);
    process.exit(1);
  }
  console.log(`\n✅ FILE PROXY GUARDS GEÇTİ (${checks} kontrol)`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
