// Deterministic checks for lib/studioflow/metaSignup.ts: what the page accepts
// from Meta's sign-up pop-up. A message counts only from an https facebook.com
// origin — not a look-alike, not http, not a subdomain of somewhere else — and
// only with digit ids; the pop-up is never offered in an emulator run or
// without both public ids.
//
//   npm run test:meta-signup
//
// Compiled with the project's own TypeScript (same shape as check-workspace-resolution.mjs).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const source = path.join(webRoot, "lib", "studioflow", "metaSignup.ts");
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-meta-signup-"));
let failures = 0;
function expect(name, ok) {
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  execFileSync(
    path.join(webRoot, "node_modules", ".bin", "tsc"),
    [source, "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck", "--lib", "es2022,dom"],
    { stdio: "inherit" },
  );
  const { isFacebookOrigin, parseSignupMessage, metaSignupConfig } = await import(pathToFileURL(path.join(outDir, "metaSignup.js")).href);

  // Origins.
  for (const good of ["https://www.facebook.com", "https://web.facebook.com", "https://facebook.com"]) expect(`origin accepted: ${good}`, isFacebookOrigin(good));
  for (const bad of ["http://www.facebook.com", "https://facebook.com.evil.example", "https://evilfacebook.com", "https://www.facebook.co", "null", "", "https://nivadesk.co.uk"]) {
    expect(`origin refused: ${bad || "(empty)"}`, !isFacebookOrigin(bad));
  }

  // Messages.
  const finish = { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { phone_number_id: "100000000000901", waba_id: "200000000000901", business_id: "3" } };
  expect("FINISH as an object", same(parseSignupMessage("https://www.facebook.com", finish), { kind: "finish", phoneNumberId: "100000000000901", wabaId: "200000000000901" }));
  expect("FINISH as a JSON string", same(parseSignupMessage("https://www.facebook.com", JSON.stringify(finish)), { kind: "finish", phoneNumberId: "100000000000901", wabaId: "200000000000901" }));
  expect("FINISH from a look-alike origin is ignored", parseSignupMessage("https://facebook.com.evil.example", finish) === null);
  expect("FINISH with a non-digit id is an error, not a number",
    same(parseSignupMessage("https://www.facebook.com", { ...finish, data: { phone_number_id: "../x", waba_id: "200000000000901" } }), { kind: "error" }));
  expect("FINISH_ONLY_WABA", same(parseSignupMessage("https://www.facebook.com", { type: "WA_EMBEDDED_SIGNUP", event: "FINISH_ONLY_WABA", data: {} }), { kind: "finish_without_number" }));
  expect("CANCEL", same(parseSignupMessage("https://www.facebook.com", { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } }), { kind: "cancel" }));
  expect("another type is ignored", parseSignupMessage("https://www.facebook.com", { type: "SOMETHING_ELSE", event: "FINISH" }) === null);
  expect("unparseable text is ignored", parseSignupMessage("https://www.facebook.com", "{not json") === null);

  // Config.
  const env = process.env;
  env.NEXT_PUBLIC_META_APP_ID = "1593495789456540";
  env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID = "123456789012345";
  delete env.NEXT_PUBLIC_FIREBASE_EMULATOR;
  expect("both ids → offered", same(metaSignupConfig(), { appId: "1593495789456540", configId: "123456789012345", graphVersion: "v25.0" }));
  env.NEXT_PUBLIC_FIREBASE_EMULATOR = "1";
  expect("an emulator run never offers the pop-up", metaSignupConfig() === null);
  delete env.NEXT_PUBLIC_FIREBASE_EMULATOR;
  env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID = "";
  expect("no configuration id → not offered", metaSignupConfig() === null);
  env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID = "abc";
  expect("a malformed configuration id → not offered", metaSignupConfig() === null);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll Meta sign-up checks passed.");
