// The workspace's client-facing domain layer (the domain-link report).
//
// Two levels, one registry. Every workspace can claim a subdomain slug
// ("eggcraft" → eggcraft.nivadesk.app); a paid workspace can additionally
// connect its own hostname ("track.eggcraft.co.uk") via a CNAME to
// customers.nivadesk.app. Both live in ONE top-level `clientDomains`
// collection keyed by the host itself, so answering "whose domain is this?"
// is a single document read — the shape Cloudflare-for-SaaS style routing
// wants. Deliberately named client domains, not portal domains: tracking,
// estimates, invoices and every future customer-facing page ride the same
// hostname.
//
// The registry only maps host → workspace. DNS at the registrar and the
// wildcard/custom-hostname infrastructure are set up outside the codebase;
// nothing here breaks while that is still pending — verification simply
// reports what the DNS actually says.

// Slugs and hostnames that must never become a workspace's client domain.
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "mail", "smtp", "imap", "pop", "ftp", "admin", "root",
  "portal", "track", "customers", "customer", "client", "clients", "status",
  "help", "support", "docs", "blog", "shop", "store", "dev", "test", "staging",
  "beta", "demo", "assets", "static", "cdn", "img", "images", "files",
  "nivadesk", "niva", "eggcraft", "mcp", "auth", "login", "signup", "billing",
  "pay", "payments", "invoice", "invoices", "email", "webmail", "ns1", "ns2"
]);

const CNAME_TARGET = "customers.nivadesk.app";

// Cloudflare for SaaS: once the owner's CNAME is verified, the edge still
// needs a custom-hostname entry before it will answer TLS for that host.
// With an API token in NIVADESK_CF_API_TOKEN this happens automatically at
// verify time; without one (or with the placeholder value) verification
// stays DNS-only and the hostname is added by hand in the dashboard.
const CF_API = "https://api.cloudflare.com/client/v4";
const CF_ZONE_NAME = "nivadesk.app";

function createClientDomainFunctions({ admin, onCall, HttpsError, uidIsCompanyOwner, planForCompany, dnsResolveCname, companySettingsDocRef, cfApiToken }) {
  const db = () => admin.firestore();
  const domainsRef = () => db().collection("clientDomains");
  const companyRef = (companyId) => db().collection("companies").doc(String(companyId));
  const REGION = "europe-west2";
  const cfSecrets = cfApiToken ? [cfApiToken] : [];
  let cachedZoneId = "";

  function cfToken() {
    try {
      const value = String(cfApiToken?.value() || "").trim();
      return !value || value.toLowerCase() === "placeholder" ? "" : value;
    } catch {
      return "";
    }
  }

  async function cfFetch(token, path, options = {}) {
    const response = await fetch(`${CF_API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      const message = (body.errors || []).map((row) => row && row.message).filter(Boolean).join("; ") || `HTTP ${response.status}`;
      throw new Error(`Cloudflare API: ${message}`);
    }
    return body;
  }

  async function cfZoneId(token) {
    if (cachedZoneId) return cachedZoneId;
    const body = await cfFetch(token, `/zones?name=${CF_ZONE_NAME}&status=active`);
    const zone = (body.result || [])[0];
    if (!zone || !zone.id) throw new Error(`Cloudflare API: zone ${CF_ZONE_NAME} not found for this token`);
    cachedZoneId = String(zone.id);
    return cachedZoneId;
  }

  async function cfEnsureCustomHostname(token, host) {
    const zoneId = await cfZoneId(token);
    const existing = await cfFetch(token, `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(host)}`);
    let row = (existing.result || [])[0];
    if (!row) {
      const created = await cfFetch(token, `/zones/${zoneId}/custom_hostnames`, {
        method: "POST",
        body: JSON.stringify({ hostname: host, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } })
      });
      row = created.result || {};
    }
    return {
      id: String(row.id || ""),
      status: String(row.status || ""),
      sslStatus: String((row.ssl && row.ssl.status) || "")
    };
  }

  async function cfDeleteCustomHostname(token, cfId) {
    const zoneId = await cfZoneId(token);
    await cfFetch(token, `/zones/${zoneId}/custom_hostnames/${encodeURIComponent(cfId)}`, { method: "DELETE" });
  }

  async function requireOwner(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");
    const companyId = String(request.data?.companyId || "").trim();
    if (!companyId) throw new HttpsError("invalid-argument", "companyId is required.");
    const snap = await companyRef(companyId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Workspace not found.");
    const companyData = snap.data() || {};
    if (!uidIsCompanyOwner(companyData, uid)) {
      throw new HttpsError("permission-denied", "The client domain is managed by the workspace owner.");
    }
    return { uid, companyId, companyData };
  }

  function cleanSlug(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validateSlug(slug) {
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug)) {
      throw new HttpsError("invalid-argument", "A subdomain is 3–40 characters: letters, numbers and hyphens, starting and ending with a letter or number.");
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new HttpsError("already-exists", "That subdomain is reserved.");
    }
  }

  function cleanHost(value) {
    return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  }

  // "eggcraft.co.uk/track" means path-based routing, which DNS cannot do.
  // Stripping the path silently would misconfigure the apex instead — say no
  // and say why (the report's own eggcraft.co.uk/track warning).
  function assertNoPath(value) {
    const withoutProtocol = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (withoutProtocol.includes("/")) {
      throw new HttpsError("invalid-argument", "DNS cannot route paths like yourdomain.com/track — use a subdomain such as track.yourdomain.com instead.");
    }
  }

  function validateCustomHost(host) {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,}$/.test(host) || host.length > 253) {
      throw new HttpsError("invalid-argument", "Enter a full hostname like track.yourdomain.com — a subdomain of a domain you own.");
    }
    if (host.endsWith(".nivadesk.app") || host === "nivadesk.app") {
      throw new HttpsError("invalid-argument", "nivadesk.app subdomains are claimed with the subdomain field, not as a custom domain.");
    }
  }

  // ---------------------------------------------------------------------------

  function cleanAccentColor(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
      throw new HttpsError("invalid-argument", "The accent colour must be a hex value like #2f6f6d.");
    }
    return raw.toLowerCase();
  }

  const getClientDomainConfig = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireOwner(request);
    const [snap, settingsSnap] = await Promise.all([
      domainsRef().where("companyId", "==", companyId).limit(10).get(),
      companySettingsDocRef(companyId).get()
    ]);
    const rows = snap.docs.map((doc) => ({ host: doc.id, ...(doc.data() || {}) }));
    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    return {
      ok: true,
      subdomain: rows.find((row) => row.kind === "subdomain") || null,
      customDomains: rows.filter((row) => row.kind === "custom"),
      cnameTarget: CNAME_TARGET,
      branding: {
        accentColor: /^#[0-9a-f]{6}$/i.test(String(settings.portalAccentColor || "")) ? String(settings.portalAccentColor).toLowerCase() : "",
        showPoweredBy: settings.portalShowPoweredBy !== false
      }
    };
  });

  // Branding for the customer-facing pages rides in the same section: the
  // accent is free, hiding the Powered by line is white-label territory and
  // stays with the paid tiers like custom domains do.
  const saveClientPortalBranding = onCall({ region: REGION }, async (request) => {
    const { uid, companyId, companyData } = await requireOwner(request);
    const accentColor = cleanAccentColor(request.data?.accentColor);
    const showPoweredBy = request.data?.showPoweredBy !== false;
    if (!showPoweredBy) {
      const plan = planForCompany(companyData);
      if (!["pro_monthly", "team_monthly"].includes(plan)) {
        throw new HttpsError("failed-precondition", "Hiding the Powered by NivaDesk line is part of the Pro and Team plans.");
      }
    }
    await companySettingsDocRef(companyId).set({
      portalAccentColor: accentColor,
      portalShowPoweredBy: showPoweredBy,
      portalBrandingUpdatedAtMs: Date.now(),
      portalBrandingUpdatedByUid: uid
    }, { merge: true });
    return { ok: true, accentColor, showPoweredBy };
  });

  const setClientSubdomain = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireOwner(request);
    const slug = cleanSlug(request.data?.slug);
    validateSlug(slug);
    const now = Date.now();

    await db().runTransaction(async (tx) => {
      const newRef = domainsRef().doc(slug);
      const newSnap = await tx.get(newRef);
      if (newSnap.exists && String((newSnap.data() || {}).companyId) !== companyId) {
        throw new HttpsError("already-exists", "That subdomain is already taken.");
      }
      // One slug per workspace: claiming a new one releases the old.
      const mineSnap = await tx.get(domainsRef().where("companyId", "==", companyId).limit(10));
      for (const doc of mineSnap.docs) {
        const row = doc.data() || {};
        if (row.kind === "subdomain" && doc.id !== slug) tx.delete(doc.ref);
      }
      tx.set(newRef, {
        companyId,
        kind: "subdomain",
        status: "active",
        createdAtMs: newSnap.exists ? Number((newSnap.data() || {}).createdAtMs) || now : now,
        updatedAtMs: now,
        updatedByUid: uid
      });
      tx.set(companyRef(companyId), { clientPortalSlug: slug }, { merge: true });
    });

    return { ok: true, slug, host: `${slug}.nivadesk.app` };
  });

  const requestClientDomain = onCall({ region: REGION }, async (request) => {
    const { uid, companyId, companyData } = await requireOwner(request);
    // Custom hostnames are the branded tier — Pro and Team (report: option A,
    // included in Pro to make £19 look strong).
    const plan = planForCompany(companyData);
    if (!["pro_monthly", "team_monthly"].includes(plan)) {
      throw new HttpsError("failed-precondition", "Custom domains are part of the Pro and Team plans.");
    }
    assertNoPath(request.data?.host);
    const host = cleanHost(request.data?.host);
    validateCustomHost(host);
    const now = Date.now();

    await db().runTransaction(async (tx) => {
      const ref = domainsRef().doc(host);
      const snap = await tx.get(ref);
      if (snap.exists && String((snap.data() || {}).companyId) !== companyId) {
        throw new HttpsError("already-exists", "That hostname is already connected to another workspace.");
      }
      tx.set(ref, {
        companyId,
        kind: "custom",
        status: snap.exists ? String((snap.data() || {}).status || "pending") : "pending",
        cnameTarget: CNAME_TARGET,
        createdAtMs: snap.exists ? Number((snap.data() || {}).createdAtMs) || now : now,
        updatedAtMs: now,
        updatedByUid: uid
      });
    });

    return {
      ok: true,
      host,
      status: "pending",
      record: { type: "CNAME", name: host.split(".")[0], target: CNAME_TARGET }
    };
  });

  const verifyClientDomain = onCall({ region: REGION, timeoutSeconds: 60, secrets: cfSecrets }, async (request) => {
    const { companyId } = await requireOwner(request);
    const host = cleanHost(request.data?.host);
    const ref = domainsRef().doc(host);
    const snap = await ref.get();
    if (!snap.exists || String((snap.data() || {}).companyId) !== companyId) {
      throw new HttpsError("not-found", "Add the domain first, then verify it.");
    }

    let records = [];
    let error = "";
    try {
      records = await dnsResolveCname(host);
    } catch (failure) {
      error = String(failure?.code || failure?.message || failure || "lookup failed");
    }
    const normalized = (records || []).map((row) => String(row || "").toLowerCase().replace(/\.$/, ""));
    const verified = normalized.includes(CNAME_TARGET);
    const now = Date.now();
    await ref.set({
      status: verified ? "active" : "pending",
      lastCheckedAtMs: now,
      lastCheckFound: normalized.slice(0, 5),
      ...(verified ? { verifiedAtMs: now } : {}),
      updatedAtMs: now
    }, { merge: true });
    // The company doc carries the preferred link host so every link builder
    // (portal, estimate, SMS) reads one field instead of querying the registry.
    // With several verified customs the most recently verified one wins.
    if (verified && String((snap.data() || {}).kind) === "custom") {
      await companyRef(companyId).set({ clientPortalCustomHost: host }, { merge: true });
    }

    // DNS says the CNAME is in place — now make the edge answer TLS for it.
    // A CF failure never un-verifies the domain; it is reported separately so
    // the owner sees "verified, certificate still being issued" rather than a
    // false DNS error.
    let certificate = null;
    if (verified && String((snap.data() || {}).kind) === "custom") {
      const token = cfToken();
      if (token) {
        try {
          const cf = await cfEnsureCustomHostname(token, host);
          certificate = { status: cf.sslStatus === "active" ? "active" : (cf.sslStatus || "pending") };
          await ref.set({ cfHostnameId: cf.id, cfHostnameStatus: cf.status, cfSslStatus: cf.sslStatus, cfLastError: "", cfCheckedAtMs: now }, { merge: true });
        } catch (cfFailure) {
          certificate = { status: "error", error: String(cfFailure?.message || cfFailure) };
          await ref.set({ cfLastError: String(cfFailure?.message || cfFailure), cfCheckedAtMs: now }, { merge: true });
        }
      }
    }

    return {
      ok: true,
      host,
      verified,
      found: normalized,
      expected: CNAME_TARGET,
      ...(certificate ? { certificate } : {}),
      ...(error && !verified ? { error } : {})
    };
  });

  const removeClientDomain = onCall({ region: REGION, secrets: cfSecrets }, async (request) => {
    const { companyId } = await requireOwner(request);
    const host = cleanHost(request.data?.host);
    const ref = domainsRef().doc(host);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const row = snap.data() || {};
    if (String(row.companyId) !== companyId) {
      throw new HttpsError("permission-denied", "That hostname belongs to another workspace.");
    }
    // Tidy the edge entry too — a removed domain must stop serving, not keep a
    // certificate alive for a hostname the workspace no longer claims.
    if (row.kind === "custom" && row.cfHostnameId) {
      const token = cfToken();
      if (token) {
        try {
          await cfDeleteCustomHostname(token, String(row.cfHostnameId));
        } catch (cfFailure) {
          console.warn("removeClientDomain: Cloudflare cleanup failed", host, String(cfFailure?.message || cfFailure));
        }
      }
    }
    await ref.delete();
    if (row.kind === "subdomain") {
      await companyRef(companyId).set({ clientPortalSlug: "" }, { merge: true });
    }
    if (row.kind === "custom") {
      const companySnap = await companyRef(companyId).get();
      const currentHost = String(((companySnap.exists ? companySnap.data() : {}) || {}).clientPortalCustomHost || "").toLowerCase();
      if (currentHost === host) {
        await companyRef(companyId).set({ clientPortalCustomHost: "" }, { merge: true });
      }
    }
    return { ok: true };
  });

  // Public: the portal pages ask "whose host am I on?" to brand themselves and
  // to refuse dressing one workspace's order in another workspace's domain.
  const resolveClientDomain = onCall({ region: REGION }, async (request) => {
    const host = cleanHost(request.data?.host);
    if (!host) return { ok: true, match: null };
    const key = host.endsWith(".nivadesk.app") ? host.slice(0, -".nivadesk.app".length) : host;
    const snap = await domainsRef().doc(key).get();
    if (!snap.exists) return { ok: true, match: null };
    const row = snap.data() || {};
    if (row.kind === "custom" && String(row.status) !== "active") return { ok: true, match: null };
    return { ok: true, match: { companyId: String(row.companyId || ""), kind: String(row.kind || "") } };
  });

  return {
    getClientDomainConfig,
    saveClientPortalBranding,
    setClientSubdomain,
    requestClientDomain,
    verifyClientDomain,
    removeClientDomain,
    resolveClientDomain,
    _internal: { RESERVED_SLUGS, CNAME_TARGET, validateSlug: (s) => validateSlug(cleanSlug(s)), cleanHost }
  };
}

module.exports = { createClientDomainFunctions };
