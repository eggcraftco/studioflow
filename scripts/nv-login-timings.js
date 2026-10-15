/* NivaDesk sign-in / menu timings — paste into the browser console (or run as a bookmarklet).
 * Reads only this page's own Performance timeline and the screen; sends nothing anywhere, stores nothing.
 * Paste once: it starts recording. Paste again (or type nvReport()) to print the table.
 * Works on the live build of 15 Oct (it watches the loading card, the network and route changes) and, once the
 * timing marks ship, also prints the app's own stage marks (auth / workspace / page / nav).
 * Query strings are cut from every URL it prints, so no session ids or keys appear in the output. */
(() => {
  if (window.__nvProbe) { window.__nvProbe.report(); return; }
  const ev = [];
  const now = () => Math.round(performance.now());
  const add = (t, kind, detail) => ev.push({ t, kind, detail: detail || "" });
  const SEL = {
    "loading(full-screen)": ".loading-screen-overlay",
    "loading(in-page)": ".app-content-loading",
    "login-form": ".login-public-shell",
    "workspace-error": ".workspace-load-error",
    "retry-panel": "[data-boot-stall]",
    "lock": ".session-lock-overlay"
  };
  const on = {};
  let path = "";
  const check = () => {
    for (const [name, sel] of Object.entries(SEL)) {
      const shown = !!document.querySelector(sel);
      if (shown !== !!on[name]) { on[name] = shown; add(now(), shown ? `${name} ON` : `${name} off`, location.pathname); }
    }
    if (path !== location.pathname) { path = location.pathname; add(now(), "route", path); }
  };
  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
  check();
  document.addEventListener("click", e => {
    const a = e.target && e.target.closest && e.target.closest('a[href^="/"]');
    if (a) add(now(), "click", a.getAttribute("href"));
  }, true);
  document.addEventListener("visibilitychange", () => add(now(), `tab ${document.visibilityState}`));
  window.addEventListener("online", () => add(now(), "browser online"));
  window.addEventListener("offline", () => add(now(), "browser OFFLINE"));
  const kindOf = n =>
    /accounts:lookup|accounts:signIn|signInWith|identitytoolkit/.test(n) ? "net auth" :
    /securetoken/.test(n) ? "net token-refresh" :
    /firestore\.googleapis\.com.*\/Listen\//.test(n) ? (/[?&]TYPE=xmlhttp/.test(n) ? "net firestore-read stream (long by design)" : "net firestore-read request") :
    /firestore\.googleapis\.com.*\/Write\//.test(n) ? (/[?&]TYPE=xmlhttp/.test(n) ? "net firestore-write stream (long by design)" : "net firestore-write request") :
    /firestore\.googleapis\.com/.test(n) ? "net firestore-other" :
    /firebaseappcheck|recaptcha/.test(n) ? "net app-check" :
    /[?&]_rsc=/.test(n) ? "net route-data" : null;
  const net = [];
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const k = kindOf(e.name);
        if (k) net.push({ t: Math.round(e.startTime), kind: k, ms: Math.round(e.duration), url: e.name.split("?")[0].slice(0, 90) });
      }
    }).observe({ type: "resource", buffered: true });
  } catch (_) { /* older browser: no network rows */ }
  const report = raw => {
    check();
    const rows = [];
    // 1) every loading card: when it appeared, how long it stayed, on which route
    const open = {};
    for (const e of ev) {
      const m = /^(loading\(.+\)) (ON|off)$/.exec(e.kind);
      if (!m) continue;
      if (m[2] === "ON") open[m[1]] = e;
      else if (open[m[1]]) { rows.push({ at_ms: open[m[1]].t, what: m[1], route: open[m[1]].detail, lasted_ms: e.t - open[m[1]].t }); delete open[m[1]]; }
    }
    for (const [k, e] of Object.entries(open)) rows.push({ at_ms: e.t, what: `${k} STILL ON`, route: e.detail, lasted_ms: now() - e.t });
    // 2) the app's own stage marks, when the build has them
    const boot = window.__nvBoot || [];
    const pair = (a, b, label, aDetail) => {
      for (const s of boot.filter(r => r.name === a && (aDetail === undefined || r.detail === aDetail))) {
        const e = boot.find(r => r.name === b && r.t >= s.t && (!s.detail || !/^\d/.test(s.detail) || r.detail.split(" ")[0] === s.detail));
        rows.push({ at_ms: s.t, what: label, route: s.path, lasted_ms: e ? e.t - s.t : `open ${now() - s.t}`, note: e ? e.detail : "" });
      }
    };
    pair("auth:wait", "auth:state", "stage A: Firebase session restored (page load)");
    pair("auth:state", "auth:ready", "stage A: signed in -> app may open", "user");
    pair("auth:bootstrap-start", "auth:bootstrap-end", "stage A: first sign-in workspace check");
    pair("ws:start", "ws:end", "stage B: workspace + membership read");
    pair("nav:click", "nav:path", "route change (click to new page)");
    for (const r of boot.filter(r => /stall|recover/.test(r.name))) rows.push({ at_ms: r.t, what: r.name, route: r.path, lasted_ms: "" });
    rows.sort((x, y) => x.at_ms - y.at_ms);
    console.log("%cNivaDesk timings (ms since this tab loaded the page; nothing was sent anywhere)", "font-weight:bold");
    console.table(rows);
    const slow = net.filter(n => n.ms >= 1000).sort((x, y) => x.t - y.t);
    console.log(`Network requests that took 1 s or more (${slow.length} of ${net.length}):`);
    console.table(slow);
    console.log("Screen events:"); console.table(ev.slice(-80));
    const text = JSON.stringify({ ua: navigator.userAgent, online: navigator.onLine, at: new Date().toISOString(), rows, slow, events: ev.slice(-80) });
    try { if (typeof copy === "function") { copy(text); console.log("The same report is now on your clipboard — paste it into a message."); } } catch (_) { /* copy() is a console helper */ }
    return raw ? JSON.parse(text) : "";
  };
  window.__nvProbe = { report };
  window.nvReport = report;
  console.log("%cNivaDesk timings: recording. Use the app; then type nvReport() and press Return.", "font-weight:bold");
})();
