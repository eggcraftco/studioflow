// Etsy's webhook endpoint.
//
// Etsy sends four events — order.paid, order.canceled, order.shipped,
// order.delivered — and the payload is deliberately thin: event_type, shop_id
// and a resource_url. The real data is fetched afterwards with the seller's
// own token, which is the right shape: nothing sensitive travels in a request
// we did not authenticate yet.
//
// Three things this endpoint must get right.
//
//   1. Verify on the RAW BYTES. The signature covers
//      "webhook-id.webhook-timestamp.body", and re-serialising the parsed JSON
//      changes key order and whitespace, so the signature never matches. Every
//      implementation gets this wrong once; Firebase gives us req.rawBody, and
//      that is what goes into the HMAC.
//   2. Deduplicate. Etsy retries on any non-2xx, and a retry after a timeout
//      is indistinguishable from a new event except by its webhook-id.
//   3. Answer quickly and honestly. A 2xx means "received"; a 5xx asks Etsy to
//      send it again. Anything we cannot process yet — an unknown shop, a
//      disconnected connection — is a 2xx, because retrying will not help and
//      a retry storm helps nobody.
//
// Subscriptions are configured by us in Etsy's Webhook Portal, not through the
// API, and the signing secret comes from there as one app-wide `whsec_` value.

const WEBHOOK_EVENTS = new Set(["order.paid", "order.canceled", "order.shipped", "order.delivered"]);

// A misconfigured webhook is worth diagnosing once. A stranger sending wrong
// signatures on purpose is not worth diagnosing at all, and the diagnosis is
// dozens of HMAC passes over bytes they chose.
const DIAGNOSIS_INTERVAL_MS = 10 * 60 * 1000;
let lastDiagnosisMs = 0;

function createEtsyWebhookFunction(deps) {
  const {
    admin,
    onRequest,
    etsy,
    connect,
    applyReceipt,
    signingSecret,              // () => string
    companySettingsDocRef,
    resolveDefaultDeliveryTime,
    now = () => Date.now()
  } = deps;

  const db = () => admin.firestore();

  return onRequest({ region: "europe-west2" }, async (req, res) => {
    if (req.method !== "POST") {
      res.status(200).json({ ok: true, message: "Etsy webhook endpoint is alive." });
      return;
    }

    // Trimmed: the secret is pasted by a human from Etsy's portal, and a
    // trailing newline would change the HMAC key and reject every real event.
    const secret = String(signingSecret() || "").trim();
    if (!secret) {
      // Unconfigured is our problem, not Etsy's. Say so in the log and accept,
      // rather than making Etsy retry an endpoint that will keep failing.
      console.error("etsyWebhook: no signing secret configured");
      res.status(200).json({ ok: false, reason: "not_configured" });
      return;
    }

    const verdict = etsy.verifyWebhookSignature({
      rawBody: req.rawBody,          // the exact bytes Etsy sent
      webhookId: req.get("webhook-id"),
      webhookTimestamp: req.get("webhook-timestamp"),
      webhookSignature: req.get("webhook-signature"),
      signingSecret: secret,
      nowMs: now()
    });
    if (!verdict.ok) {
      // An unverified request is not from Etsy as far as we are concerned.
      // 401 and no detail: telling a prober which check failed helps them.
      console.warn("etsyWebhook rejected:", verdict.reason);
      // The diagnosis tries every plausible secret encoding and body framing,
      // which is dozens of HMAC passes over the caller's own bytes. That is
      // fine once, when a real webhook is misconfigured and someone is trying
      // to find out why. It is not fine on demand: any stranger with a wrong
      // signature could buy that work for the price of one HTTP request, as
      // often as they liked. At most one per instance per ten minutes.
      const canDiagnose = now() - lastDiagnosisMs > DIAGNOSIS_INTERVAL_MS;
      if (verdict.reason === "signature_mismatch" && canDiagnose && typeof etsy.diagnoseWebhookSignature === "function") {
        lastDiagnosisMs = now();
        // Names and lengths only — never a secret, a signature or a body.
        try {
          console.warn("etsyWebhook signature diagnosis:", JSON.stringify(etsy.diagnoseWebhookSignature({
            rawBody: req.rawBody,
            webhookId: req.get("webhook-id"),
            webhookTimestamp: req.get("webhook-timestamp"),
            webhookSignature: req.get("webhook-signature"),
            signingSecret: secret
          })));
        } catch (error) {
          console.warn("etsyWebhook diagnosis failed:", error?.message || error);
        }
      }
      res.status(401).json({ ok: false });
      return;
    }

    const webhookId = String(req.get("webhook-id") || "");
    const body = req.body || {};
    const eventType = String(body.event_type || "");
    const shopId = String(body.shop_id || "");
    const resourceUrl = String(body.resource_url || "");

    if (!WEBHOOK_EVENTS.has(eventType)) {
      res.status(200).json({ ok: true, ignored: eventType });
      return;
    }

    // Deduplicate before doing any work. create() fails if the id exists, which
    // makes this atomic against two concurrent deliveries of the same event.
    const eventRef = db().collection(etsy.WEBHOOK_EVENT_COLLECTION).doc(etsy.safeIdPart(webhookId) || `${shopId}_${now()}`);
    try {
      await eventRef.create({
        eventType,
        shopId,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Seven days, like the Shopify dedupe rows: longer than any provider's
        // retry window, short enough that the collection stays a window rather
        // than a history. The TTL policy reads this field.
        expireAt: admin.firestore.Timestamp.fromMillis(now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (_error) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    try {
      // Which workspace owns this shop? The webhook says nothing about that,
      // and we must never take a workspace id from an inbound request.
      // EVERY workspace that has this shop connected, not the first one.
      //
      // One shop really can be connected twice: a seller with two NivaDesk
      // accounts, or a workshop mid-migration between them. The design already
      // allows for it — order document ids carry the workspace, precisely so
      // two workspaces cannot fight over one order — and Square's webhook
      // already fans out the same way. Only this one took `limit(1)`, so a
      // receipt went to whichever connection id happened to sort first and the
      // other workspace waited up to fifteen minutes for the sweep to notice.
      // Arbitrary from both tenants' point of view, and invisible.
      const snap = await db().collection(etsy.CONNECTION_COLLECTION)
        .where("externalShopId", "==", shopId)
        .where("status", "==", "connected")
        .limit(10)
        .get();
      if (snap.empty) {
        await eventRef.set({ outcome: "no_connection" }, { merge: true });
        res.status(200).json({ ok: true, unknownShop: true });
        return;
      }

      const outcomes = [];
      let fetchedAny = false;
      for (const connectionSnap of snap.docs) {
        const connectionData = connectionSnap.data() || {};
        const companyId = String(connectionData.companyId || "");
        const connectionRef = connectionSnap.ref;
        if (!companyId) continue;

        try {
          // The resource_url is where Etsy says the fresh data lives. Only
          // accept one that points at Etsy's own API — an attacker who ever got
          // past the signature must not also get a request sent wherever they
          // like.
          //
          // Fetched per connection because each holds its own token; a shop
          // whose second workspace has a stale token must not stop the first
          // from being updated.
          let receipt = null;
          if (resourceUrl.startsWith(etsy.ETSY_API_BASE) || resourceUrl.startsWith("https://openapi.etsy.com/")) {
            receipt = await connect.callEtsy(connectionRef, resourceUrl);
          }
          if (!receipt) {
            outcomes.push({ companyId, status: "no_resource" });
            continue;
          }
          fetchedAny = true;

          const settings = await companySettingsDocRef(companyId).get().catch(() => null);
          const result = await applyReceipt({
            companyId,
            connectionRef,
            connectionData,
            receipt,
            defaultDeliveryTime: resolveDefaultDeliveryTime(settings?.data() || {})
          });
          outcomes.push({ companyId, status: result.status, receiptId: result.receiptId });
          await connect.writeSyncEvent(connectionRef, {
            type: "webhook",
            event: eventType,
            receiptId: result.receiptId,
            outcome: result.status
          });
        } catch (error) {
          // Recorded, not swallowed: a failure still has to reach the 500 below
          // so Etsy sends the delivery again. Re-applying it to the workspaces
          // that already took it is safe — the order id is deterministic and
          // applyReceipt refuses a snapshot older than the one it holds — and
          // losing it for one workspace is not.
          console.warn("etsyWebhook connection failed:", connectionSnap.id, error?.message || error);
          outcomes.push({ companyId, status: "failed", error });
        }
      }

      if (!fetchedAny) {
        await eventRef.set({ outcome: "no_resource" }, { merge: true });
        res.status(200).json({ ok: true, fetched: false });
        return;
      }

      const firstFailure = outcomes.find((row) => row.status === "failed");
      if (firstFailure) throw firstFailure.error || new Error("etsy webhook apply failed");

      const primary = outcomes.find((row) => row.status && row.status !== "no_resource") || outcomes[0] || {};
      await eventRef.set({ outcome: primary.status || "failed", receiptId: primary.receiptId || "", applied: outcomes.length }, { merge: true });
      res.status(200).json({ ok: true, outcome: primary.status || "failed", applied: outcomes.length });
    } catch (error) {
      console.error("etsyWebhook processing failed:", error?.message || error);
      // Release the dedupe key so Etsy's retry can genuinely retry rather than
      // being swallowed as a duplicate of a delivery we never finished.
      await eventRef.delete().catch(() => {});
      res.status(500).json({ ok: false });
    }
  });
}

module.exports = { createEtsyWebhookFunction, WEBHOOK_EVENTS };
