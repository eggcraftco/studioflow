"use strict";

// Everything this codebase reads from its environment, in one place, with
// what is required per role stated once.
//
// Secrets (the LWA client secret, the intent HMAC key) arrive as environment
// variables mounted from Secret Manager by the Cloud Run spec — they are
// never in a file in this repository and never in a log line. Per-connection
// refresh tokens are not environment at all; connections.js reads them from
// Secret Manager at use.

const ROLES = Object.freeze(["oauth", "admin", "sync", "diag"]);

const REQUIRED = Object.freeze({
  oauth: ["SP_API_APPLICATION_ID", "LWA_CLIENT_ID", "LWA_CLIENT_SECRET", "INTENT_HMAC_KEY", "OAUTH_REDIRECT_URI", "MAIN_APP_RETURN_URL"],
  admin: ["ADMIN_CALLER_EMAIL", "ADMIN_AUDIENCE"],
  sync: ["LWA_CLIENT_ID", "LWA_CLIENT_SECRET", "BRIDGE_URL", "SYNC_CALLER_EMAIL", "SYNC_AUDIENCE"],
  // The diagnostic job: no secrets, no routes, no ingress. Resolves the Google
  // API hostnames and reports which addresses answered, then exits.
  diag: []
});

function loadConfig(env = process.env) {
  const role = String(env.ROLE || "").trim();
  if (!ROLES.includes(role)) throw new Error(`config: ROLE must be one of ${ROLES.join(", ")}`);
  const missing = REQUIRED[role].filter((key) => !String(env[key] || "").trim());
  if (missing.length) throw new Error(`config: missing for role ${role}: ${missing.join(", ")}`);

  const hmacHex = String(env.INTENT_HMAC_KEY || "").trim();
  if (hmacHex && !/^[0-9a-f]{64,}$/i.test(hmacHex)) throw new Error("config: INTENT_HMAC_KEY must be hex, at least 32 bytes");

  return Object.freeze({
    role,
    projectId: String(env.GOOGLE_CLOUD_PROJECT || env.PROJECT_ID || "").trim(),
    region: String(env.REGION || "europe-west2").trim(),
    port: Number(env.PORT) || 8080,

    // Login with Amazon and the SP-API application.
    spApiApplicationId: String(env.SP_API_APPLICATION_ID || "").trim(),
    lwaClientId: String(env.LWA_CLIENT_ID || "").trim(),
    lwaClientSecret: String(env.LWA_CLIENT_SECRET || ""),
    sellerCentralHost: String(env.SELLER_CENTRAL_HOST || "sellercentral-europe.amazon.com").trim(),
    draftApplication: String(env.SP_API_DRAFT || "") === "1",
    // The regional SP-API host for marketplace discovery before we know a marketplace.
    defaultRegion: String(env.SP_API_REGION || "eu").trim(),

    // The connect flow.
    intentHmacKey: hmacHex ? Buffer.from(hmacHex, "hex") : null,
    redirectUri: String(env.OAUTH_REDIRECT_URI || "").trim(),
    mainAppReturnUrl: String(env.MAIN_APP_RETURN_URL || "").trim(),
    pendingConnectionTtlMs: Number(env.PENDING_CONNECTION_TTL_MS) || 15 * 60 * 1000,

    // Who may call what. Each is one exact service-account email.
    adminCallerEmail: String(env.ADMIN_CALLER_EMAIL || "").trim().toLowerCase(),
    adminAudience: String(env.ADMIN_AUDIENCE || "").trim(),
    syncCallerEmail: String(env.SYNC_CALLER_EMAIL || "").trim().toLowerCase(),
    syncAudience: String(env.SYNC_AUDIENCE || "").trim(),

    // The one door out to the main project.
    bridgeUrl: String(env.BRIDGE_URL || "").trim(),

    // Sync tuning.
    syncOverlapMinutes: Number(env.SYNC_OVERLAP_MINUTES) || 15,
    syncMaxOrdersPerRun: Number(env.SYNC_MAX_ORDERS_PER_RUN) || 500,
    orderRetentionDays: Number(env.ORDER_RETENTION_DAYS) || 90
  });
}

module.exports = { loadConfig, ROLES, REQUIRED };
