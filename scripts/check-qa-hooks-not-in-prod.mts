// QA-only hooks never ship in a production build (calendar V1 close, 29 Oct 2026).
//
// Two hooks exist for the local emulator runs only: `window.__emulatorSignIn` / `__emulatorAuth` (lib/firebase/client.ts,
// signs a test workspace in with a custom token) and the calendar's `nivadesk.qa.timeZone` override (app/calendar/page.tsx).
// Both hang on `process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1"` AND a localhost page. next.config.ts fixes the flag into
// every bundle as "1" or "", so a normal build folds the condition to false and the minifier removes the hooks. This reads
// the built chunks: in a build made without the flag none of the markers may appear; the source must still carry both
// locks, so an emulator build keeps working.
//
//   npx tsx scripts/check-qa-hooks-not-in-prod.mts [--require-build]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireBuild = process.argv.includes("--require-build");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// The source keeps both locks (the flag and a localhost page) and the build-time constant.
const client = read("lib/firebase/client.ts");
ok("client.ts: the sign-in hook needs the flag", /NEXT_PUBLIC_FIREBASE_EMULATOR === "1"/.test(client));
ok("client.ts: the sign-in hook needs a localhost page", /\["localhost", "127\.0\.0\.1", "\[::1\]"\]\.includes\(window\.location\.hostname\)/.test(client));
const calendar = read("app/calendar/page.tsx");
ok("calendar: the time-zone override needs the flag", /process\.env\.NEXT_PUBLIC_FIREBASE_EMULATOR !== "1"/.test(calendar));
ok("calendar: the time-zone override needs a localhost page", /\["localhost", "127\.0\.0\.1"\]\.includes\(window\.location\.hostname\)/.test(calendar));
const config = read("next.config.ts");
ok("next.config.ts fixes the flag into the bundle as \"1\" or \"\"", /NEXT_PUBLIC_FIREBASE_EMULATOR: NV_FIREBASE_EMULATOR/.test(config) && /=== "1" \? "1" : ""/.test(config));

// The built chunks (when a build is present).
const MARKERS = ["__emulatorSignIn", "__emulatorAuth", "nivadesk.qa.timeZone"];
const staticDir = path.join(root, ".next", "static");
const envFile = [".env.local", ".env.production", ".env"].map(f => path.join(root, f)).find(f => fs.existsSync(f));
const builtWithFlag = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1"
  || (envFile ? /^NEXT_PUBLIC_FIREBASE_EMULATOR=1\s*$/m.test(fs.readFileSync(envFile, "utf8")) : false);
if (!fs.existsSync(staticDir)) {
  ok("a build is present (.next/static)", !requireBuild);
  if (!requireBuild) console.log("qa-hooks: no build here — source checks only");
} else if (builtWithFlag) {
  console.log("qa-hooks: this tree builds WITH the emulator flag — chunk check skipped (hooks are meant to be there)");
} else {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".js")) files.push(p);
    }
  };
  walk(staticDir);
  ok(`built chunks found (${files.length})`, files.length > 0);
  for (const marker of MARKERS) {
    const hits = files.filter(f => fs.readFileSync(f, "utf8").includes(marker)).map(f => path.relative(root, f));
    ok(`no production chunk carries ${marker}${hits.length ? ` (found in ${hits.join(", ")})` : ""}`, hits.length === 0);
  }
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`qa-hooks: ${checks - failures.length}/${checks} pass${failures.length ? "" : "; reds: none"}`);
process.exit(failures.length ? 1 : 0);
