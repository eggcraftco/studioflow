// The headers must actually be emitted, not merely configured. Started against
// the built app, asked for a page, headers read off the response.
const { spawn } = require("child_process");
const REQUIRED = {
  "strict-transport-security": /max-age=31536000; includeSubDomains/,
  "x-content-type-options": /nosniff/,
  "x-frame-options": /DENY/,
  "referrer-policy": /strict-origin-when-cross-origin/,
  "permissions-policy": /camera=\(\)/,
  "cross-origin-opener-policy": /^same-origin-allow-popups$/,
  "cross-origin-resource-policy": /same-origin/
};
const server = spawn("npx", ["next", "start", "-p", "3311"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production" } });
let out = "";
server.stdout.on("data", d => { out += d; });
server.stderr.on("data", d => { out += d; });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 40; i++) { await wait(500); if (/Ready|started server|Local:/i.test(out)) break; }
  await wait(1500);
  let failures = 0;
  try {
    const res = await fetch("http://127.0.0.1:3311/");
    for (const [name, pattern] of Object.entries(REQUIRED)) {
      const value = res.headers.get(name);
      const ok = value && pattern.test(value);
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${value ?? "(absent)"}`);
    }
    const powered = res.headers.get("x-powered-by");
    console.log(`${powered ? "FAIL" : "PASS"}  x-powered-by removed${powered ? `: still ${powered}` : ""}`);
    if (powered) failures++;
    console.log(`\npage still served: HTTP ${res.status}`);
    if (res.status !== 200) failures++;
  } catch (e) {
    console.log("could not reach the server:", e.message);
    failures++;
  }
  server.kill("SIGTERM");
  process.exit(failures ? 1 : 0);
})();
