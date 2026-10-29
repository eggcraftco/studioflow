// The headers must actually be emitted, not merely configured. Started against
// the built app, asked for a page, headers read off the response.
//
// Content-Security-Policy-Report-Only (security audit #18, 28 Oct 2026) is
// checked the same way: present on pages, carrying a fresh nonce per response,
// with the directives that matter, and every inline <script> in the HTML
// carrying that same nonce (Next's own, and the theme bootstrap).
//
//   node scripts/check-security-headers.js [port]     (needs `next build` first; default port 3311)
const { spawn } = require("child_process");
const path = require("path");
const port = String(process.argv[2] || process.env.SECURITY_HEADERS_PORT || "3311");
const REQUIRED = {
  "strict-transport-security": /max-age=31536000; includeSubDomains/,
  "x-content-type-options": /nosniff/,
  "x-frame-options": /DENY/,
  "referrer-policy": /strict-origin-when-cross-origin/,
  "permissions-policy": /camera=\(\)/,
  "cross-origin-opener-policy": /^same-origin-allow-popups$/,
  "cross-origin-resource-policy": /same-origin/
};
const CSP_DIRECTIVES = [
  [/(^|; )script-src [^;]*'nonce-[A-Za-z0-9+/=]{16,}'/, "script-src carries a nonce"],
  [/(^|; )frame-ancestors 'none'(;|$)/, "frame-ancestors 'none'"],
  [/(^|; )object-src 'none'(;|$)/, "object-src 'none'"],
  [/(^|; )base-uri 'self'(;|$)/, "base-uri 'self'"],
  [/(^|; )connect-src [^;]*https:\/\/firestore\.googleapis\.com/, "connect-src allows Firestore"],
  [/(^|; )connect-src [^;]*https:\/\/identitytoolkit\.googleapis\.com/, "connect-src allows Identity Toolkit"],
  [/(^|; )frame-src [^;]*https:\/\/firebasestorage\.googleapis\.com/, "frame-src allows Storage"],
  [/(^|; )frame-src [^;]*https:\/\/www\.google\.com/, "frame-src allows reCAPTCHA"]
];
const server = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", port], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production" }
});
let out = "";
server.stdout.on("data", d => { out += d; });
server.stderr.on("data", d => { out += d; });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nonceOf = csp => (String(csp || "").match(/'nonce-([^']+)'/) || [])[1] || "";
(async () => {
  for (let i = 0; i < 40; i++) { await wait(500); if (/Ready|started server|Local:/i.test(out)) break; }
  await wait(1500);
  let failures = 0;
  const check = (ok, line) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${line}`); };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    for (const [name, pattern] of Object.entries(REQUIRED)) {
      const value = res.headers.get(name);
      check(Boolean(value && pattern.test(value)), `${name}: ${value ?? "(absent)"}`);
    }
    const powered = res.headers.get("x-powered-by");
    check(!powered, `x-powered-by removed${powered ? `: still ${powered}` : ""}`);

    // ---- CSP, report-only
    const csp = res.headers.get("content-security-policy-report-only");
    check(Boolean(csp), `content-security-policy-report-only present${csp ? ` (${csp.length} chars)` : ""}`);
    check(!res.headers.get("content-security-policy"), "no enforcing content-security-policy yet (owner's switch)");
    for (const [pattern, label] of CSP_DIRECTIVES) check(Boolean(csp && pattern.test(csp)), `CSP-RO ${label}`);
    check(Boolean(csp) && !/(^|; )script-src [^;]*'unsafe-inline'/.test(csp), "CSP-RO script-src has no 'unsafe-inline'");
    check(Boolean(csp) && !/'unsafe-eval'/.test(csp), "CSP-RO has no 'unsafe-eval' in production");
    const nonce = nonceOf(csp);
    const html = await res.text();
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]).filter(attrs => !/\bsrc=/.test(attrs));
    const withNonce = inline.filter(attrs => attrs.includes(`nonce="${nonce}"`));
    const unsigned = inline.filter(attrs => !/\bnonce=/.test(attrs) && !/type="application\/(ld\+)?json"/.test(attrs));
    check(inline.length > 0 && unsigned.length === 0, `every executable inline <script> carries the nonce (${withNonce.length}/${inline.length}; unsigned ${unsigned.length})`);
    check(/nonce="[^"]+"[^>]*>\s*try \{\s*var storedTheme|<script[^>]*nonce="[^"]+"[^>]*>[^<]*studioflow-app-theme/.test(html), "the theme bootstrap carries the nonce");
    const again = await fetch(`http://127.0.0.1:${port}/`);
    const nonce2 = nonceOf(again.headers.get("content-security-policy-report-only"));
    await again.text();
    check(Boolean(nonce && nonce2 && nonce !== nonce2), "a fresh nonce per response");
    const login = await fetch(`http://127.0.0.1:${port}/login`);
    check(Boolean(login.headers.get("content-security-policy-report-only")), `/login carries the policy (HTTP ${login.status})`);
    await login.text();
    const chunk = (html.match(/\/_next\/static\/[^"']+\.js/) || [])[0];
    if (chunk) {
      const js = await fetch(`http://127.0.0.1:${port}${chunk}`);
      check(!js.headers.get("content-security-policy-report-only"), "static chunks are not given the policy (not documents)");
      await js.arrayBuffer();
    }

    console.log(`\npage still served: HTTP ${res.status}`);
    if (res.status !== 200) failures++;
  } catch (e) {
    console.log("could not reach the server:", e.message);
    failures++;
  }
  server.kill("SIGINT");
  console.log(failures ? `security-headers: ${failures} FAIL` : "security-headers: all PASS");
  process.exit(failures ? 1 : 0);
})();
