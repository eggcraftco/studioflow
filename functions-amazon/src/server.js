"use strict";

// The process. One image, one ROLE per Cloud Run service:
//
//   oauth   /oauth/start  /oauth/callback          (browser, via the LB)
//   admin   /admin/status /admin/disconnect /admin/sync-now   (main project, OIDC)
//   sync    /run                                    (Cloud Scheduler, OIDC)
//
// and /healthz on all three. Anything else is 404 — Cloud Armor should never
// let it this far, and this is the layer behind Cloud Armor.
//
// Wiring only. Every decision lives in the modules, which take their
// dependencies injected and are tested without a project.

const http = require("http");
const { loadConfig } = require("./config");
const { createEgress } = require("./egress");
const { createConnections } = require("./connections");
const { createOidcVerifier, createIdentityTokenSource } = require("./oidc");
const { createOauthFlow } = require("./oauthFlow");
const { createSync } = require("./sync");
const { createBridge } = require("./bridge");
const { createAdmin } = require("./admin");

const MAX_BODY = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY) { reject(new Error("body_too_large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, out) {
  const body = out.body || "";
  res.writeHead(out.status, { "Content-Length": Buffer.byteLength(body), ...(out.headers || {}) });
  res.end(body);
}

function build(config, deps = {}) {
  const admin = deps.admin || (() => {
    const firebaseAdmin = require("firebase-admin");
    if (!firebaseAdmin.apps.length) firebaseAdmin.initializeApp({ projectId: config.projectId });
    return firebaseAdmin;
  })();
  const secrets = deps.secrets || (() => {
    const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
    return new SecretManagerServiceClient();
  })();

  const egress = createEgress({ extraHosts: [config.bridgeUrl].filter(Boolean), fetchImpl: deps.fetchImpl });
  const connections = createConnections({ admin, secrets, projectId: config.projectId, region: config.region });
  const routes = {};

  if (config.role === "oauth") {
    const flow = createOauthFlow({ config, connections, egress });
    routes["GET /oauth/start"] = (req) => flow.start(req);
    routes["GET /oauth/callback"] = (req) => flow.callback(req);
  }

  if (config.role === "sync" || config.role === "admin") {
    let sync = null;
    if (config.role === "sync") {
      const identityToken = createIdentityTokenSource({ audience: config.bridgeUrl, fetchImpl: egress.fetch });
      const bridge = createBridge({ egress, bridgeUrl: config.bridgeUrl, identityToken });
      sync = createSync({ config, connections, egress, bridge });
      const verifyScheduler = createOidcVerifier({ allowedEmail: config.syncCallerEmail, audience: config.syncAudience });
      routes["POST /run"] = async (req) => {
        const auth = await verifyScheduler(req.headers);
        if (!auth.ok) return { status: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "forbidden" }) };
        const totals = await sync.runOnce();
        return { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(totals) };
      };
    }
    if (config.role === "admin") {
      const verifyCaller = createOidcVerifier({ allowedEmail: config.adminCallerEmail, audience: config.adminAudience });
      const adminApi = createAdmin({ connections, verifyCaller, sync: null });
      routes["GET /admin/status"] = (req) => adminApi.status(req);
      routes["POST /admin/disconnect"] = (req) => adminApi.disconnect(req);
      routes["POST /admin/sync-now"] = (req) => adminApi.syncNow(req);
    }
  }

  return { routes, egress, connections };
}

function start() {
  const config = loadConfig(process.env);
  const { routes } = build(config);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: config.role, ok: true }) });
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return send(res, { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "not_found" }) });

    let body = {};
    try {
      const text = req.method === "POST" ? await readBody(req) : "";
      body = text ? JSON.parse(text) : {};
    } catch {
      return send(res, { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "bad_request" }) });
    }
    const query = Object.fromEntries(url.searchParams.entries());
    try {
      const out = await handler({ query, body, headers: req.headers });
      return send(res, out);
    } catch (error) {
      // Never the error's message: it can carry a code, a token, or a path.
      console.error(`${config.role} ${req.method} ${url.pathname} failed: ${String(error && error.name || "Error")}`);
      return send(res, { status: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "internal" }) });
    }
  });

  server.listen(config.port, () => console.log(`nivadesk-amazon role=${config.role} listening on ${config.port}`));
  return server;
}

if (require.main === module) start();

module.exports = { build, start };
