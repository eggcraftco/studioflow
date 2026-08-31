// Etsy connection lifecycle: connect, verify, refresh, disconnect.
//
// This is the part that holds someone else's shop credentials, so the shape of
// it is deliberately narrow:
//
//   * The browser asks for a URL and gets a URL. It never sees a token, a
//     verifier, or the keystring beyond what Etsy itself puts in the address
//     bar. The code exchange happens in the callback function, server-side.
//   * The `state` is not a nonce we merely compare — it is a document that
//     carries who started the flow, which workspace they were in, and the PKCE
//     verifier. Consumed with a transaction so a replayed callback finds it
//     gone. That is what stops someone pasting their own Etsy authorization
//     into your workspace.
//   * Only an owner/admin may connect or disconnect. A viewer being able to
//     attach a shop would be a way to push data into a workspace they cannot
//     otherwise write to.
//
// The single-flight refresh matters more than it looks. Etsy access tokens
// last an hour, and a reconciliation sweep plus a webhook burst can easily ask
// three workers to refresh the same connection at the same second. Etsy issues
// a NEW refresh token on every refresh and invalidates the old one, so two
// concurrent refreshes mean one of them stores a refresh token that is already
// dead — and the connection breaks an hour later, far from the cause.

const REFRESH_LEAD_MS = 5 * 60 * 1000;      // refresh once under five minutes remain
const REFRESH_LOCK_MS = 60 * 1000;          // a lock older than this is presumed crashed
const CONNECT_REDIRECT_FALLBACK = "https://nivadesk.app/settings";

function createEtsyConnectFunctions(deps) {
  const {
    admin,
    onCall,
    onRequest,
    HttpsError,
    etsy,                       // the ./etsy module
    keystring,                  // () => string
    tokenKey,                   // () => string
    redirectUri,                // () => string
    sharedSecret = () => "",    // () => string, the x-api-key value
    requireWorkspaceOwner,      // (request) => { uid, companyId, companyData }
    requireWorkspaceMember,     // (request) => { uid, companyId, companyData }
    appReturnUrl = () => CONNECT_REDIRECT_FALLBACK,
    now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();
  const connections = () => db().collection(etsy.CONNECTION_COLLECTION);
  const states = () => db().collection(etsy.OAUTH_STATE_COLLECTION);

  // -------------------------------------------------------------------------
  // Storage helpers
  // -------------------------------------------------------------------------

  /** What a client is allowed to know about a connection. No tokens, ever. */
  function publicConnectionView(id, data) {
    const row = data || {};
    return {
      id,
      provider: "etsy",
      shopId: String(row.externalShopId || ""),
      shopName: String(row.externalShopName || ""),
      shopCurrency: String(row.shopCurrency || ""),
      status: String(row.status || "unknown"),
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      connectedAtMs: millis(row.connectedAt),
      lastSyncAtMs: millis(row.lastSyncAt),
      lastSuccessAtMs: millis(row.lastSuccessAt),
      lastErrorCode: String(row.lastErrorCode || ""),
      lastErrorAtMs: millis(row.lastErrorAt),
      // A token that cannot be refreshed is the one failure a seller must act
      // on, so it is surfaced as its own flag rather than buried in a code.
      needsReconnect: String(row.status || "") === "needs_reconnect",
      importState: String(row.importState || "none"),
      importedOrders: Number(row.importedOrders || 0)
    };
  }

  function millis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function loadConnection(connectionId, companyId) {
    const snap = await connections().doc(String(connectionId)).get();
    if (!snap.exists) throw new HttpsError("not-found", "This Etsy connection no longer exists.");
    const data = snap.data() || {};
    // The workspace check is the isolation boundary. Without it, knowing a
    // connection id would be enough to sync someone else's shop.
    if (String(data.companyId) !== String(companyId)) {
      throw new HttpsError("permission-denied", "This Etsy connection belongs to another workspace.");
    }
    return { ref: snap.ref, data };
  }

  async function writeSyncEvent(connectionRef, event) {
    try {
      await connectionRef.collection("syncLog").add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        ...event
      });
    } catch (error) {
      // The log is evidence, not a dependency. Losing a row must never fail a sync.
      console.warn("etsy syncLog write failed:", error?.message || error);
    }
  }

  // -------------------------------------------------------------------------
  // Access tokens
  // -------------------------------------------------------------------------

  /**
   * Return a usable access token for this connection, refreshing if needed.
   *
   * Single-flight: the refresh is claimed inside a transaction, so of two
   * workers only one calls Etsy. The loser waits and re-reads rather than
   * racing, because Etsy rotates the refresh token and the loser would
   * otherwise persist a dead one.
   */
  async function accessTokenFor(connectionRef, { force = false } = {}) {
    const snap = await connectionRef.get();
    const data = snap.data() || {};
    if (String(data.status) === "disconnected") {
      throw new HttpsError("failed-precondition", "This Etsy shop is disconnected.");
    }

    const expiresAt = millis(data.tokenExpiresAt);
    const fresh = !force && expiresAt - now() > REFRESH_LEAD_MS;
    if (fresh && data.accessTokenEncrypted) {
      return etsy.decryptToken(data.accessTokenEncrypted, tokenKey());
    }

    const claimed = await db().runTransaction(async (tx) => {
      const current = await tx.get(connectionRef);
      const row = current.data() || {};
      const lockedAt = millis(row.refreshLockAt);
      if (lockedAt && now() - lockedAt < REFRESH_LOCK_MS) return false;
      tx.update(connectionRef, { refreshLockAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    });

    if (!claimed) {
      // Someone else is refreshing. Give them a moment, then use what they stored.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const after = await connectionRef.get();
      const row = after.data() || {};
      if (row.accessTokenEncrypted) return etsy.decryptToken(row.accessTokenEncrypted, tokenKey());
      throw new HttpsError("unavailable", "The Etsy connection is being refreshed. Try again shortly.");
    }

    try {
      // A stored blob we cannot read is permanent — the key rotated, or the row
      // is corrupt — and only reconnecting fixes it. Name it, so the handler
      // below can tell it apart from a network blip instead of treating every
      // codeless throw as an expired connection.
      let refreshToken;
      try {
        refreshToken = etsy.decryptToken(data.refreshTokenEncrypted, tokenKey());
      } catch (unreadable) {
        throw new etsy.EtsyApiError("token_unreadable", "The stored Etsy refresh token could not be read.");
      }
      if (!refreshToken) throw new etsy.EtsyApiError("auth_expired", "No refresh token stored.");
      const tokens = await etsy.refreshAccessToken({ keystring: keystring(), refreshToken });
      const access = String(tokens?.access_token || "");
      if (!access) throw new etsy.EtsyApiError("auth_expired", "Etsy returned no access token.");
      const expiresIn = Number(tokens?.expires_in) || 3600;
      await connectionRef.set({
        accessTokenEncrypted: etsy.encryptToken(access, tokenKey()),
        // Etsy rotates the refresh token on every refresh; keeping the old one
        // would strand the connection at the next hour boundary.
        refreshTokenEncrypted: tokens?.refresh_token
          ? etsy.encryptToken(String(tokens.refresh_token), tokenKey())
          : data.refreshTokenEncrypted,
        tokenExpiresAt: now() + expiresIn * 1000,
        status: "connected",
        lastErrorCode: "",
        refreshLockAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return access;
    } catch (error) {
      // A failure must never write status "connected".
      //
      // The old line did (`auth_expired ? needs_reconnect : "connected"`) and it
      // was wrong twice over. A dead refresh token arrives as 400 invalid_grant,
      // not 401, so it took the "connected" branch and the one state a seller
      // has to act on could never be reached. And any transient failure — a
      // network blip, or a token blob that will not decrypt because the key was
      // rotated — erased a needs_reconnect that some earlier attempt had set
      // correctly. So: promote to needs_reconnect on an auth failure, and
      // otherwise leave `status` exactly as it was and record only the error.
      // Only failures that will fail again. auth_expired is Etsy refusing the
      // refresh token; token_unreadable is a blob we cannot decrypt. Both need
      // the seller to reconnect and nothing else will fix them.
      //
      // This used to include `|| !error?.code`, meaning ANY throw without a
      // code — a network blip, a Firestore hiccup, a TypeError in our own
      // code — permanently marked a healthy connection as needing a reconnect,
      // and only a full OAuth round trip could clear it. The decrypt failure it
      // was written for now carries its own code, so the guess is not needed.
      const authFailure = error?.code === "auth_expired" || error?.code === "token_unreadable";
      const patch = {
        lastErrorCode: String(error?.code || "upstream"),
        lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        refreshLockAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (authFailure) patch.status = "needs_reconnect";
      await connectionRef.set(patch, { merge: true });
      await writeSyncEvent(connectionRef, { type: "token_refresh_failed", error: String(error?.code || "") });
      throw error;
    }
  }

  /** One Etsy call on behalf of a connection, refreshing the token once if it expired. */
  async function callEtsy(connectionRef, path, options = {}) {
    let token = await accessTokenFor(connectionRef);
    try {
      return await etsy.etsyFetch(path, { ...options, keystring: keystring(), apiKey: etsy.etsyApiKey(keystring(), sharedSecret()), accessToken: token });
    } catch (error) {
      if (error?.code !== "auth_expired") throw error;
      // The stored expiry said fresh but Etsy disagrees — the token was revoked
      // or rotated elsewhere. One forced refresh, then give up honestly.
      token = await accessTokenFor(connectionRef, { force: true });
      return etsy.etsyFetch(path, { ...options, keystring: keystring(), apiKey: etsy.etsyApiKey(keystring(), sharedSecret()), accessToken: token });
    }
  }

  // -------------------------------------------------------------------------
  // Connect
  // -------------------------------------------------------------------------

  const beginEtsyConnect = onCall({ region: "europe-west2" }, async (request) => {
    const { uid, companyId } = await requireWorkspaceOwner(request);
    if (!keystring()) throw new HttpsError("failed-precondition", "Etsy is not configured on this server yet.");

    const verifier = etsy.makeCodeVerifier();
    const state = etsy.makeState();
    await states().doc(state).set({
      companyId,
      uid,
      codeVerifier: etsy.encryptToken(verifier, tokenKey()),
      redirectUri: redirectUri(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: now() + etsy.OAUTH_STATE_TTL_MS,
      used: false
    });

    return {
      ok: true,
      // The client only ever forwards the browser here. Everything secret about
      // this flow stays in the state document.
      authorizeUrl: etsy.authorizeUrl({
        keystring: keystring(),
        redirectUri: redirectUri(),
        state,
        codeChallenge: etsy.codeChallengeFor(verifier)
      }),
      scopes: etsy.ETSY_SCOPES
    };
  });

  // -------------------------------------------------------------------------
  // Callback
  // -------------------------------------------------------------------------

  function connectRedirect(res, params) {
    const url = new URL(appReturnUrl());
    // Name the destination explicitly. The seller is coming back from granting
    // access to their shop, and every one of these outcomes - connected,
    // cancelled, or failed - is only readable on the Etsy panel. Sending them
    // to /settings and hoping the right panel is open is how a successful
    // connection looks to the seller like nothing happened.
    url.searchParams.set("section", "etsy");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    res.redirect(302, url.toString());
  }

  const etsyOAuthCallback = onRequest({ region: "europe-west2" }, async (req, res) => {
    // Etsy sends the seller's browser here. Anything that goes wrong has to end
    // as a readable page in NivaDesk, never a raw stack trace on a Google domain.
    const state = String(req.query?.state || "");
    const code = String(req.query?.code || "");
    const denied = String(req.query?.error || "");

    if (denied) {
      connectRedirect(res, { etsy: "cancelled" });
      return;
    }
    if (!state || !code) {
      connectRedirect(res, { etsy: "error", reason: "missing_code" });
      return;
    }

    let stateData = null;
    try {
      // Single use, enforced in a transaction: a replayed callback finds the
      // state already consumed and cannot attach a second connection.
      stateData = await db().runTransaction(async (tx) => {
        const ref = states().doc(state);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const row = snap.data() || {};
        if (row.used === true) return null;
        if (Number(row.expiresAt || 0) < now()) return null;
        tx.update(ref, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
        return row;
      });
    } catch (error) {
      console.error("etsyOAuthCallback state read failed:", error?.message || error);
      connectRedirect(res, { etsy: "error", reason: "state" });
      return;
    }

    if (!stateData) {
      connectRedirect(res, { etsy: "error", reason: "state" });
      return;
    }

    try {
      const verifier = etsy.decryptToken(stateData.codeVerifier, tokenKey());
      const tokens = await etsy.exchangeAuthorizationCode({
        keystring: keystring(),
        redirectUri: String(stateData.redirectUri || redirectUri()),
        code,
        codeVerifier: verifier
      });
      const accessToken = String(tokens?.access_token || "");
      const refreshToken = String(tokens?.refresh_token || "");
      if (!accessToken || !refreshToken) throw new Error("Etsy returned an incomplete token response.");

      const etsyUserId = etsy.etsyUserIdFromToken(accessToken);
      // Which shop is this? Ask Etsy rather than trusting anything in the URL.
      //
      // The path takes the numeric user id, not the word "me" — Etsy's
      // getShopByOwnerUserId is /users/{user_id}/shops. Asking for "me" 404s,
      // and because the failure was swallowed it surfaced to the seller as
      // "this Etsy account has no shop", which is a different problem entirely
      // and sends them looking in the wrong place. So: use the id we already
      // have from the token, and let a real failure say what it was.
      // Etsy exposes the seller's shop two ways and neither is guessable from
      // the reference: getMe returns { user_id, shop_id } with no path
      // parameter, and getShopByOwnerUserId is /users/{user_id}/shops with the
      // NUMERIC id. The word "me" is not accepted in the path — it comes back
      // as "Expected int value for 'user_id' (got string)".
      //
      // Every attempt is recorded. A single last-error-wins variable hid the
      // real failure behind the fallback's, which cost a deploy cycle to find.
      let shop = null;
      const attempts = [];
      const paths = ["/users/me", etsyUserId ? `/users/${etsyUserId}/shops` : ""].filter(Boolean);
      for (const path of paths) {
        try {
          const answer = await etsy.etsyFetch(path, {
            keystring: keystring(),
            apiKey: etsy.etsyApiKey(keystring(), sharedSecret()),
            accessToken
          });
          if (answer?.shop_id || Array.isArray(answer?.results)) { shop = answer; break; }
          attempts.push(`${path}: no shop in the answer`);
        } catch (failure) {
          // Etsy's own words, not just the status: a 403 here can mean the
          // header, the scope or the app's access level, and the status alone
          // cannot tell them apart. Server log only; the seller sees a sentence.
          const detail = String(failure?.body || "").slice(0, 200);
          attempts.push(`${path}: ${failure?.message || failure}${detail ? ` ${detail}` : ""}`);
        }
      }
      const lookupError = attempts.join(" | ");
      const firstShop = Array.isArray(shop?.results) ? shop.results[0] : (shop?.shop_id ? shop : null);
      const shopId = String(firstShop?.shop_id || "");
      if (!shopId) {
        // "This account owns no shop" is not a fault the seller can debug from a
        // stack trace, and it is the single most likely reason a first connect
        // fails: people sign in with the Etsy account they buy from. Etsy says
        // so in as many words, so name the case and let the screen say it
        // plainly. Everything else stays a generic failure with the detail in
        // the log, where it belongs.
        const noShop = /could not find a shop/i.test(lookupError);
        const failure = new Error(
          lookupError
            ? `Etsy would not tell us which shop this account owns: ${lookupError}`
            : "This Etsy account has no shop NivaDesk can read."
        );
        failure.connectReason = noShop ? "no_shop" : "";
        throw failure;
      }

      // Deterministic id: reconnecting the same shop updates the same row rather
      // than leaving a graveyard of stale connections behind.
      const connectionId = `${etsy.safeIdPart(stateData.companyId)}_${etsy.safeIdPart(shopId)}`;
      const ref = connections().doc(connectionId);
      const existing = await ref.get();

      await ref.set({
        companyId: String(stateData.companyId),
        provider: "etsy",
        externalUserId: etsyUserId,
        externalShopId: shopId,
        externalShopName: String(firstShop?.shop_name || ""),
        shopCurrency: String(firstShop?.currency_code || ""),
        status: "connected",
        scopes: etsy.ETSY_SCOPES,
        accessTokenEncrypted: etsy.encryptToken(accessToken, tokenKey()),
        refreshTokenEncrypted: etsy.encryptToken(refreshToken, tokenKey()),
        tokenExpiresAt: now() + (Number(tokens?.expires_in) || 3600) * 1000,
        connectedByUserId: String(stateData.uid || ""),
        connectedAt: existing.exists
          ? (existing.data() || {}).connectedAt || admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
        // A reconnect must not silently re-run the first import.
        importState: existing.exists ? (existing.data() || {}).importState || "none" : "none",
        lastErrorCode: "",
        disconnectedAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await writeSyncEvent(ref, { type: existing.exists ? "reconnected" : "connected", shopId });
      connectRedirect(res, { etsy: "connected", shop: shopId });
    } catch (error) {
      console.error("etsyOAuthCallback failed:", error?.message || error);
      connectRedirect(res, { etsy: "error", reason: error?.connectReason || "exchange" });
    }
  });

  // -------------------------------------------------------------------------
  // Read, verify, disconnect
  // -------------------------------------------------------------------------

  const getEtsyConnections = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const snap = await connections().where("companyId", "==", companyId).get();
    const rows = await Promise.all(snap.docs.map(async (docSnap) => {
      const view = publicConnectionView(docSnap.id, docSnap.data());
      try {
        const log = await docSnap.ref.collection("syncLog").orderBy("ts", "desc").limit(9).get();
        view.recentEvents = log.docs.map((row) => {
          const event = row.data() || {};
          return {
            atMs: millis(event.ts),
            type: String(event.type || ""),
            error: String(event.error || "").slice(0, 200),
            receiptId: String(event.receiptId || "")
          };
        });
      } catch (_error) {
        view.recentEvents = [];
      }
      return view;
    }));
    return { ok: true, connections: rows, configured: Boolean(keystring()) };
  });

  const verifyEtsyConnection = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceMember(request);
    const { ref } = await loadConnection(request.data?.connectionId, companyId);
    try {
      const me = await callEtsy(ref, "/users/me");
      await ref.set({
        status: "connected",
        lastSuccessAt: admin.firestore.FieldValue.serverTimestamp(),
        lastErrorCode: "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return { ok: true, healthy: true, etsyUserId: String(me?.user_id || "") };
    } catch (error) {
      await writeSyncEvent(ref, { type: "verify_failed", error: String(error?.code || "") });
      return { ok: true, healthy: false, reason: String(error?.code || "unknown") };
    }
  });

  /**
   * Disconnect. Deliberately NOT a delete.
   *
   * The seller's NivaDesk orders, production work, notes and costs stay exactly
   * where they are — they are the studio's own records, not Etsy's. What goes
   * is the ability to keep syncing: the tokens are revoked at Etsy where
   * possible and destroyed here either way.
   */
  const disconnectEtsyShop = onCall({ region: "europe-west2" }, async (request) => {
    const { companyId } = await requireWorkspaceOwner(request);
    const { ref } = await loadConnection(request.data?.connectionId, companyId);
    await ref.set({
      status: "disconnected",
      accessTokenEncrypted: admin.firestore.FieldValue.delete(),
      refreshTokenEncrypted: admin.firestore.FieldValue.delete(),
      tokenExpiresAt: admin.firestore.FieldValue.delete(),
      refreshLockAt: admin.firestore.FieldValue.delete(),
      disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await writeSyncEvent(ref, { type: "disconnected" });
    return { ok: true, ordersKept: true };
  });

  return {
    beginEtsyConnect,
    etsyOAuthCallback,
    getEtsyConnections,
    verifyEtsyConnection,
    disconnectEtsyShop,
    // exported for the sync engine and for tests
    _internal: { accessTokenFor, callEtsy, loadConnection, publicConnectionView, writeSyncEvent }
  };
}

module.exports = { createEtsyConnectFunctions, REFRESH_LEAD_MS, REFRESH_LOCK_MS };
