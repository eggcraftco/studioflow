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

function createClientDomainFunctions({ admin, onCall, HttpsError, uidIsCompanyOwner, planForCompany, dnsResolveCname }) {
  const db = () => admin.firestore();
  const domainsRef = () => db().collection("clientDomains");
  const companyRef = (companyId) => db().collection("companies").doc(String(companyId));
  const REGION = "europe-west2";

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

  const getClientDomainConfig = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireOwner(request);
    const snap = await domainsRef().where("companyId", "==", companyId).limit(10).get();
    const rows = snap.docs.map((doc) => ({ host: doc.id, ...(doc.data() || {}) }));
    return {
      ok: true,
      subdomain: rows.find((row) => row.kind === "subdomain") || null,
      customDomains: rows.filter((row) => row.kind === "custom"),
      cnameTarget: CNAME_TARGET
    };
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

  const verifyClientDomain = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
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

    return {
      ok: true,
      host,
      verified,
      found: normalized,
      expected: CNAME_TARGET,
      ...(error && !verified ? { error } : {})
    };
  });

  const removeClientDomain = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireOwner(request);
    const host = cleanHost(request.data?.host);
    const ref = domainsRef().doc(host);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const row = snap.data() || {};
    if (String(row.companyId) !== companyId) {
      throw new HttpsError("permission-denied", "That hostname belongs to another workspace.");
    }
    await ref.delete();
    if (row.kind === "subdomain") {
      await companyRef(companyId).set({ clientPortalSlug: "" }, { merge: true });
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
    setClientSubdomain,
    requestClientDomain,
    verifyClientDomain,
    removeClientDomain,
    resolveClientDomain,
    _internal: { RESERVED_SLUGS, CNAME_TARGET, validateSlug: (s) => validateSlug(cleanSlug(s)), cleanHost }
  };
}

module.exports = { createClientDomainFunctions };
