// Etsy integration — the server side of it, all of it.
//
// Etsy is a native connection, not a webhook recipe. The difference that
// matters: NivaDesk holds an OAuth token for the seller's shop and pulls the
// receipts itself, so it can reconcile what it missed. A Zapier webhook cannot
// do that — if the automation is off for an hour, that hour is simply gone.
//
// Three rules shape this module.
//
//   1. The browser never sees an Etsy token. Every Etsy call happens here, and
//      the tokens live in server-only collections the security rules deny to
//      every client, encrypted on top of that.
//   2. Etsy owns the money and the buyer; the workspace owns the work. A resync
//      may refresh a price or an address, and must never touch the production
//      steps, notes, assignments or costs the studio put in. That rule is
//      already implemented for Shopify and WooCommerce as
//      INTEGRATION_SHOP_OWNED_FIELDS, and Etsy reuses it rather than inventing
//      a second one.
//   3. Nothing is imported behind the seller's back. The first import is a
//      preview they approve, and an order NivaDesk cannot map is reported with
//      a reason instead of being skipped quietly.
//
// Etsy specifics worth knowing before editing:
//   * PKCE is mandatory on every authorization request, and the token exchange
//     takes NO client secret — the keystring is the client_id.
//   * Access tokens last one hour; refresh tokens last 90 days.
//   * Webhooks exist (order.paid / canceled / shipped / delivered) and are
//     signed in the Standard Webhooks format, but they are configured by the
//     seller in Etsy's Webhook Portal rather than by an API call, and the
//     payload carries only event_type, shop_id and a resource_url. The real
//     data is fetched afterwards. So webhooks make sync fast; they are never
//     the only path, which is why reconciliation exists.

const crypto = require("crypto");

const ETSY_AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_API_BASE = "https://openapi.etsy.com/v3/application";

// Read-only, and deliberately no more than that. Phase 1 of the rollout runs
// entirely inside "read sales data": no listing writes, no inventory push, no
// tracking write-back. Asking for a scope we do not use would be its own kind
// of dishonesty on the consent screen the seller reads.
const ETSY_SCOPES = ["transactions_r", "email_r", "shops_r"];

// The NivaDesk app's actual limit, read off the Etsy developer dashboard rather
// than assumed: 5 requests/second and 5,000/day. That daily figure is the one
// that shapes the sync engine — a full re-import of a busy shop can spend a
// meaningful slice of it, which is why reconciliation queries by
// min_last_modified instead of walking the whole history again.
// 220ms between calls keeps us under 5/s with room to spare; bursting into a
// 429 costs a whole retry cycle and buys nothing.
const ETSY_REQUESTS_PER_SECOND = 5;
const ETSY_REQUESTS_PER_DAY = 5000;
const ETSY_MIN_CALL_GAP_MS = 220;
const ETSY_MAX_ATTEMPTS = 4;

// Standard Webhooks: reject anything whose timestamp is outside this window so
// a captured request cannot be replayed later.
const WEBHOOK_TOLERANCE_SECONDS = 300;

const CONNECTION_COLLECTION = "etsyConnections";
const OAUTH_STATE_COLLECTION = "etsyOAuthStates";
const EXTERNAL_ORDER_COLLECTION = "etsyExternalOrders";
const CUSTOMER_LINK_COLLECTION = "etsyCustomerLinks";
const WEBHOOK_EVENT_COLLECTION = "etsyWebhookEvents";

// A connect attempt that is never finished should not sit around being
// guessable. Ten minutes is longer than any honest consent screen takes.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Token encryption
//
// Firestore is encrypted at rest already, and these collections are denied to
// every client. This is the third layer, and it is here for the failure we
// cannot rule out: a rules regression, an export, a support tool reading a
// document it should not. An Etsy refresh token is 90 days of access to
// someone else's shop; it should not be legible to anyone who merely reaches
// the row.
// ---------------------------------------------------------------------------

function tokenKeyBytes(rawKey) {
  const raw = String(rawKey || "").trim();
  if (!raw) throw new Error("ETSY_TOKEN_KEY is not configured.");
  // Accept hex or base64 so the operator can paste whichever their generator
  // produced; both must decode to exactly 32 bytes for AES-256.
  let key = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) key = decoded;
    } catch (_error) { key = null; }
  }
  if (!key || key.length !== 32) {
    throw new Error("ETSY_TOKEN_KEY must be 32 bytes, as 64 hex characters or base64.");
  }
  return key;
}

function encryptToken(plain, rawKey) {
  const text = String(plain || "");
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKeyBytes(rawKey), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64")
  };
}

function decryptToken(box, rawKey) {
  if (!box || typeof box !== "object" || !box.data) return "";
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    tokenKeyBytes(rawKey),
    Buffer.from(String(box.iv || ""), "base64")
  );
  decipher.setAuthTag(Buffer.from(String(box.tag || ""), "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(String(box.data || ""), "base64")),
    decipher.final()
  ]);
  return out.toString("utf8");
}

// ---------------------------------------------------------------------------
// PKCE and state
// ---------------------------------------------------------------------------

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeCodeVerifier() {
  // 43–128 characters after base64url encoding; 32 random bytes gives 43.
  return base64Url(crypto.randomBytes(32));
}

function codeChallengeFor(verifier) {
  return base64Url(crypto.createHash("sha256").update(String(verifier), "utf8").digest());
}

function makeState() {
  return base64Url(crypto.randomBytes(32));
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorizeUrl({ keystring, redirectUri, state, codeChallenge, scopes = ETSY_SCOPES }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: String(keystring),
    redirect_uri: String(redirectUri),
    scope: scopes.join(" "),
    state: String(state),
    code_challenge: String(codeChallenge),
    code_challenge_method: "S256"
  });
  return `${ETSY_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// The HTTP adapter
//
// Everything that talks to Etsy goes through here so that rate limits, retries
// and error classification are decided once. Callers get either data or a
// typed error — never a raw fetch Response to interpret themselves.
// ---------------------------------------------------------------------------

class EtsyApiError extends Error {
  constructor(code, message, { status = 0, retryAfterMs = 0, body = "" } = {}) {
    super(message);
    this.name = "EtsyApiError";
    this.code = code;              // auth_expired | rate_limited | upstream | invalid | network
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    // Truncated on purpose: an Etsy error body can echo request content, and
    // this string ends up in logs and in the connection's error field.
    this.body = String(body || "").slice(0, 400);
  }
}

function classifyStatus(status) {
  if (status === 401 || status === 403) return "auth_expired";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "invalid";
}

// OAuth grant failures do NOT arrive as 401.
//
// Etsy's token endpoint is a public PKCE client — there is no client secret, so
// there is no client-authentication path that could produce a 401. RFC 6749
// §5.2 says an expired or revoked refresh token comes back as HTTP 400 with
// {"error":"invalid_grant"} in the body. Classifying that by status alone made
// it "invalid", and the connection then reported itself healthy forever while
// nothing synced. The body is the only place the truth is.
const OAUTH_DEAD_GRANT_ERRORS = new Set(["invalid_grant", "invalid_request", "unauthorized_client", "invalid_client"]);

function oauthErrorCode(status, body) {
  if (status === 401 || status === 403) return "auth_expired";
  if (status !== 400) return null;
  try {
    const parsed = JSON.parse(String(body || "{}"));
    if (OAUTH_DEAD_GRANT_ERRORS.has(String(parsed?.error || ""))) return "auth_expired";
  } catch (_error) { /* a body we cannot read stays whatever the status said */ }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function retryDelayMs(attempt, retryAfterMs) {
  if (retryAfterMs > 0) return Math.min(retryAfterMs, 30000);
  // Exponential with jitter, so a shop-wide failure does not resynchronise
  // every worker onto the same retry second.
  const base = Math.min(1000 * Math.pow(2, attempt), 16000);
  return base / 2 + Math.floor(Math.random() * (base / 2));
}

function parseRetryAfter(header) {
  const raw = String(header || "").trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(raw);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : 0;
}

/**
 * One Etsy API call, with retries for the failures that are worth retrying.
 *
 * `accessToken` is optional: a few endpoints are key-only. Auth failures are
 * NOT retried here — a dead token is refreshed by the caller, and hammering a
 * 401 only burns the daily quota.
 */
async function etsyFetch(path, { keystring, accessToken = "", method = "GET", query = null, body = null, timeoutMs = 20000 } = {}) {
  if (!keystring) throw new EtsyApiError("invalid", "Etsy API key is not configured.");
  const url = new URL(path.startsWith("http") ? path : `${ETSY_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt < ETSY_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { "x-api-key": String(keystring), Accept: "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (body) headers["Content-Type"] = "application/json";
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      // NOTE: the timer is deliberately NOT cleared here. `fetch` resolves when
      // the response HEADERS arrive; the body is still streaming. Clearing the
      // abort now leaves both reads below unbounded, and a server that sends
      // headers and then stalls hangs the call indefinitely — measured at
      // twelve minutes with timeoutMs set to two seconds. The timer is cleared
      // in the finally block, after the body has been consumed.
      if (response.ok) {
        const text = await response.text();
        if (!text) return null;
        try { return JSON.parse(text); } catch (_error) {
          throw new EtsyApiError("invalid", "Etsy returned a response NivaDesk could not read.", { status: response.status });
        }
      }

      const code = classifyStatus(response.status);
      const text = await response.text().catch(() => "");
      const error = new EtsyApiError(code, `Etsy request failed (${response.status}).`, {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
        body: text
      });
      // A bad token or a rejected request will fail identically next time.
      if (code === "auth_expired" || code === "invalid") throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof EtsyApiError) {
        if (error.code === "auth_expired" || error.code === "invalid") throw error;
        lastError = error;
      } else {
        lastError = new EtsyApiError("network", "Could not reach Etsy.", { body: error?.message || String(error) });
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < ETSY_MAX_ATTEMPTS - 1) await sleep(retryDelayMs(attempt, lastError?.retryAfterMs || 0));
  }
  throw lastError || new EtsyApiError("network", "Could not reach Etsy.");
}

// ---------------------------------------------------------------------------
// OAuth token exchange and refresh
// ---------------------------------------------------------------------------

/**
 * Run a token-endpoint call and re-classify a dead grant.
 *
 * etsyFetch only sees the status, and a dead refresh token is a 400. Without
 * this the caller cannot tell "the seller revoked us, ask them to reconnect"
 * from "malformed request", and the connection sits there reporting a health it does
 * not have.
 */
async function tokenGrant(body, keystring) {
  try {
    return await etsyFetch(ETSY_TOKEN_URL, { keystring, method: "POST", body });
  } catch (error) {
    if (error instanceof EtsyApiError) {
      const reclassified = oauthErrorCode(error.status, error.body);
      if (reclassified) error.code = reclassified;
    }
    throw error;
  }
}

async function exchangeAuthorizationCode({ keystring, redirectUri, code, codeVerifier }) {
  return tokenGrant({
    grant_type: "authorization_code",
    client_id: String(keystring),
    redirect_uri: String(redirectUri),
    code: String(code),
    code_verifier: String(codeVerifier)
  }, keystring);
}

async function refreshAccessToken({ keystring, refreshToken }) {
  return tokenGrant({
    grant_type: "refresh_token",
    client_id: String(keystring),
    refresh_token: String(refreshToken)
  }, keystring);
}

// Etsy access tokens are "<userId>.<random>", which is the only place the
// numeric user id arrives without a second call.
function etsyUserIdFromToken(token) {
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot <= 0) return "";
  const prefix = raw.slice(0, dot);
  return /^\d+$/.test(prefix) ? prefix : "";
}

// ---------------------------------------------------------------------------
// Webhook signature — Standard Webhooks, as Etsy implements it.
// ---------------------------------------------------------------------------

/**
 * Verify an inbound Etsy webhook.
 *
 * `rawBody` must be the exact bytes Etsy sent. Re-serialising the parsed JSON
 * changes key order and whitespace, and the signature will never match — this
 * is the single most common way to get this wrong.
 */
function verifyWebhookSignature({ rawBody, webhookId, webhookTimestamp, webhookSignature, signingSecret, nowMs = Date.now() }) {
  const id = String(webhookId || "");
  const timestamp = String(webhookTimestamp || "");
  const signatureHeader = String(webhookSignature || "");
  const secret = String(signingSecret || "");
  if (!id || !timestamp || !signatureHeader || !secret) {
    return { ok: false, reason: "missing_headers" };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "bad_timestamp" };
  const driftSeconds = Math.abs(nowMs / 1000 - sentAt);
  if (driftSeconds > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale_timestamp" };

  let key = null;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch (_error) {
    return { ok: false, reason: "bad_secret" };
  }
  if (!key.length) return { ok: false, reason: "bad_secret" };

  const signed = `${id}.${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "")}`;
  const expected = crypto.createHmac("sha256", key).update(signed, "utf8").digest("base64");

  // The header carries a space-separated list of "v1,<signature>" entries so a
  // secret can be rotated with both old and new accepted for a while.
  const candidates = signatureHeader.split(/\s+/).map((part) => {
    const comma = part.indexOf(",");
    return comma >= 0 ? part.slice(comma + 1) : part;
  }).filter(Boolean);

  for (const candidate of candidates) {
    if (timingSafeEqual(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

// ---------------------------------------------------------------------------
// Identity helpers — how an Etsy record is addressed inside NivaDesk.
//
// One receipt must land on one order, no matter how it arrives: initial
// import, webhook, reconciliation, or a seller pressing Sync now. That is what
// these deterministic ids are for. The unique key the brief asks for
// (workspace + provider + shop + external id) IS the document id, so the
// database cannot hold a duplicate even if two workers race.
// ---------------------------------------------------------------------------

/**
 * Make one component of a document id, injectively.
 *
 * Stripping characters is not enough on its own: "A.B" and "AB" strip to the
 * same thing, and with "_" as the separator an id that itself contains "_"
 * can shift the boundary between components. Either would let one workspace's
 * external-order row land on another's — the isolation failure that matters
 * most here.
 *
 * So anything that had to be changed or truncated carries a short digest of
 * the original. Ordinary ids (Firebase UIDs, Etsy's numeric shop and receipt
 * ids) are already plain alphanumerics and pass through unchanged, which keeps
 * the common id readable.
 */
function safeIdPart(value) {
  const raw = String(value || "");
  const clean = raw.replace(/[^A-Za-z0-9]/g, "");
  if (clean === raw && raw.length <= 48) return clean;
  const digest = crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 10);
  return `${clean.slice(0, 48)}${digest}`;
}

function externalOrderKey(companyId, shopId, receiptId) {
  return `${safeIdPart(companyId)}_${safeIdPart(shopId)}_${safeIdPart(receiptId)}`;
}

function customerLinkKey(companyId, shopId, buyerId) {
  return `${safeIdPart(companyId)}_${safeIdPart(shopId)}_${safeIdPart(buyerId)}`;
}

// The NivaDesk order document id for an Etsy receipt. Prefixed so a glance at
// the id says where the order came from, and stable for the same receipt.
function nivadeskOrderIdFor(shopId, receiptId) {
  return `etsy_${safeIdPart(shopId)}_${safeIdPart(receiptId)}`;
}

module.exports = {
  oauthErrorCode,
  ETSY_AUTHORIZE_URL,
  ETSY_TOKEN_URL,
  ETSY_API_BASE,
  ETSY_SCOPES,
  ETSY_MIN_CALL_GAP_MS,
  ETSY_REQUESTS_PER_SECOND,
  ETSY_REQUESTS_PER_DAY,
  WEBHOOK_TOLERANCE_SECONDS,
  OAUTH_STATE_TTL_MS,
  CONNECTION_COLLECTION,
  OAUTH_STATE_COLLECTION,
  EXTERNAL_ORDER_COLLECTION,
  CUSTOMER_LINK_COLLECTION,
  WEBHOOK_EVENT_COLLECTION,
  EtsyApiError,
  encryptToken,
  decryptToken,
  tokenKeyBytes,
  makeCodeVerifier,
  codeChallengeFor,
  makeState,
  authorizeUrl,
  timingSafeEqual,
  etsyFetch,
  exchangeAuthorizationCode,
  refreshAccessToken,
  etsyUserIdFromToken,
  verifyWebhookSignature,
  externalOrderKey,
  customerLinkKey,
  nivadeskOrderIdFor,
  safeIdPart,
  retryDelayMs,
  parseRetryAfter
};

// ---------------------------------------------------------------------------
// Normalisation: an Etsy receipt becomes a NivaDesk order.
//
// Etsy money is {amount, divisor, currency_code} — 1250 with divisor 100 is
// 12.50. Reading `amount` directly is the classic way to turn a £12.50 order
// into a £1,250 one, so every figure goes through etsyMoney().
//
// Personalization is the reason a studio uses NivaDesk at all, and Etsy hides
// it in the same `variations` array as the product options. The two are told
// apart by `question_id`: the schema marks that field "[Personalization only]".
// String-matching the word "Personalization" would break in every language
// Etsy renders for the buyer.
// ---------------------------------------------------------------------------

function etsyText(value, max = 500) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function etsyMoney(money) {
  if (!money || typeof money !== "object") return { value: 0, currency: "" };
  const amount = Number(money.amount);
  const divisor = Number(money.divisor);
  if (!Number.isFinite(amount)) return { value: 0, currency: etsyText(money.currency_code, 8) };
  // A zero or missing divisor means "no scaling"; treating it as 0 would divide
  // by zero and produce Infinity in the order total.
  const scale = Number.isFinite(divisor) && divisor > 0 ? divisor : 1;
  return {
    value: Math.round((amount / scale) * 100) / 100,
    currency: etsyText(money.currency_code, 8).toUpperCase()
  };
}

function etsyTimestampToDate(seconds, fallback = null) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return new Date(value * 1000);
}

/** Split a transaction's `variations` into buyer personalization and product options. */
function splitVariations(variations) {
  const personalization = [];
  const options = [];
  for (const row of Array.isArray(variations) ? variations : []) {
    if (!row || typeof row !== "object") continue;
    const name = etsyText(row.formatted_name, 120);
    const value = etsyText(row.formatted_value, 1000);
    if (!value) continue;
    // question_id is present only on personalization answers.
    if (row.question_id !== null && row.question_id !== undefined) personalization.push({ name, value });
    else options.push({ name, value });
  }
  return { personalization, options };
}

function transactionLabel(transaction) {
  const title = etsyText(transaction?.title, 200);
  const { options } = splitVariations(transaction?.variations);
  if (!options.length) return title;
  const suffix = options.map((option) => (option.name ? `${option.name}: ${option.value}` : option.value)).join(", ");
  return etsyText(`${title} (${suffix})`, 300);
}

/**
 * Turn one Etsy receipt into the NivaDesk order fields, the customer record,
 * and the read-only source snapshot the order screen shows beside them.
 *
 * Returns `{ order, customer, source, review }`. `review` is the honest part:
 * anything the mapper could not resolve is named there rather than guessed,
 * so the import preview can show the seller why a row needs a look.
 */
function normalizeEtsyReceipt(receipt, {
  companyId,
  shopId,
  shopName = "",
  shopCurrency = "",
  defaultDeliveryTime = 30,
  reconcileLineItems = null,
  now = new Date()
} = {}) {
  const review = [];
  const receiptId = etsyText(receipt?.receipt_id, 40);
  const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];

  const grand = etsyMoney(receipt?.grandtotal);
  const subtotal = etsyMoney(receipt?.subtotal);
  const shipping = etsyMoney(receipt?.total_shipping_cost);
  const tax = etsyMoney(receipt?.total_tax_cost);
  const vat = etsyMoney(receipt?.total_vat_cost);
  const discount = etsyMoney(receipt?.discount_amt);
  const currency = grand.currency || subtotal.currency || etsyText(shopCurrency, 8).toUpperCase();

  // The brief is explicit: never convert. If the receipt is in a currency the
  // shop does not normally use, the amount is preserved as-is and the seller is
  // asked to look, rather than NivaDesk inventing an exchange rate.
  if (shopCurrency && currency && currency !== etsyText(shopCurrency, 8).toUpperCase()) {
    review.push({ code: "currency_mismatch", currency, shopCurrency: etsyText(shopCurrency, 8).toUpperCase() });
  }

  const isPaid = receipt?.is_paid === true;
  const status = etsyText(receipt?.status, 40).toLowerCase();
  const isCancelled = status === "canceled" || status === "cancelled";
  const isRefunded = status.includes("refund") || (Array.isArray(receipt?.refunds) && receipt.refunds.length > 0);

  // Personalization and buyer notes are the production brief. Losing them is
  // the failure this whole integration exists to avoid, so they are gathered
  // once here and reused for the order note, the line labels and the snapshot.
  const personalizationLines = [];
  const lineItems = [];
  for (const transaction of transactions) {
    const { personalization } = splitVariations(transaction?.variations);
    const price = etsyMoney(transaction?.price);
    const quantity = Math.max(1, Math.round(Number(transaction?.quantity) || 1));
    for (const entry of personalization) {
      personalizationLines.push(entry.name ? `${entry.name}: ${entry.value}` : entry.value);
    }
    lineItems.push({
      id: etsyText(transaction?.transaction_id, 40) || `${receiptId}_${lineItems.length}`,
      name: transactionLabel(transaction),
      sku: etsyText(transaction?.sku, 80),
      quantity,
      unitPrice: price.value,
      total: Math.round(price.value * quantity * 100) / 100
    });
  }
  if (!transactions.length) review.push({ code: "no_line_items" });

  const buyerNote = etsyText(receipt?.message_from_buyer, 2000);
  const giftMessage = receipt?.is_gift ? etsyText(receipt?.gift_message, 1000) : "";
  const noteParts = [];
  if (personalizationLines.length) noteParts.push(`Personalisation — ${personalizationLines.join(" | ")}`);
  if (buyerNote) noteParts.push(`Buyer note — ${buyerNote}`);
  if (giftMessage) noteParts.push(`Gift message — ${giftMessage}`);

  const designName = personalizationLines.length
    ? etsyText(`${lineItems[0]?.name || "Etsy order"} — ${personalizationLines[0]}`, 300)
    : etsyText(lineItems.map((item) => item.name).filter(Boolean).join(", ") || `Etsy receipt ${receiptId}`, 300);

  const createdAt = etsyTimestampToDate(receipt?.create_timestamp ?? receipt?.created_timestamp, now);

  // Etsy's own expected ship date is a real promise the buyer has already been
  // shown. Where a transaction carries one, it beats the workspace default.
  const shipDates = transactions
    .map((transaction) => etsyTimestampToDate(transaction?.expected_ship_date, null))
    .filter(Boolean)
    .sort((a, b) => a - b);
  let deliveryTime = defaultDeliveryTime;
  if (shipDates.length && createdAt) {
    const days = Math.round((shipDates[0] - createdAt) / 86400000);
    if (days >= 1 && days <= 730) deliveryTime = days;
  }

  const buyerEmail = etsyText(receipt?.buyer_email, 200).toLowerCase();
  const buyerId = etsyText(receipt?.buyer_user_id, 40);
  if (!buyerId) review.push({ code: "no_buyer_id" });

  const addressParts = {
    name: etsyText(receipt?.name, 200),
    street: [etsyText(receipt?.first_line, 200), etsyText(receipt?.second_line, 200)].filter(Boolean).join(", "),
    city: etsyText(receipt?.city, 120),
    state: etsyText(receipt?.state, 120),
    postalCode: etsyText(receipt?.zip, 40),
    country: etsyText(receipt?.country_iso, 8)
  };

  const rawLineItems = lineItems.map((item) => ({ ...item }));
  const order = {
    companyId,
    customerName: addressParts.name || `Etsy buyer ${buyerId || receiptId}`,
    orderValue: grand.value,
    paidAmount: isPaid ? grand.value : 0,
    remainingAmount: isPaid ? 0 : grand.value,
    watchPurchasePrice: 0,
    watchRef: lineItems[0]?.sku || "",
    deliveryTime,
    designName,
    lineItems: typeof reconcileLineItems === "function" ? reconcileLineItems(rawLineItems, grand.value) : rawLineItems,
    designLink: "",
    communication: ["Etsy"],
    emailAddress: buyerEmail,
    instagramUsername: "",
    whatsappNumber: "",
    notes: noteParts.join("\n"),
    shippingName: addressParts.name,
    shippingStreetAddress: addressParts.street,
    shippingCity: addressParts.city,
    shippingPostalCode: addressParts.postalCode,
    shippingCountry: addressParts.country,
    shippingPhone: "",
    designStatus: "Not Yet",
    status: "Not Yet",
    isDispatched: receipt?.is_shipped === true,
    trackingNumber: "",
    courier: "Auto Detect",
    isDelivered: false,
    paymentFee: 0,
    deliveryCost: shipping.value,
    taxType: "",
    extraStatuses: {},
    taxRate: 0,
    taxAmount: Math.round((tax.value + vat.value) * 100) / 100,
    priority: "Normal",
    risk: "None",
    riskReason: "-",
    // The marker the rest of NivaDesk reads to know where an order came from.
    // Two things depend on it and both were silently wrong while it was empty:
    // the dashboard's channel pills could not scope figures to Etsy, and the
    // tax recalculation, which skips orders whose tax came from a shop, was
    // instead overwriting Etsy's own figure with the workspace default rate.
    // Same shape as the Shopify and WooCommerce importers.
    customFields: {
      Source: "Etsy",
      "Etsy Receipt ID": receiptId,
      "Etsy Shop": etsyText(shopName, 200),
      "Etsy Status": status,
      "Etsy Payment Method": etsyText(receipt?.payment_method, 80),
      "Etsy Currency": currency,
      "Etsy Total": String(grand.value),
      "Etsy Created At": createdAt ? new Date(createdAt).toISOString() : "",
      "Etsy Products": lineItems.map((item) => item.name).filter(Boolean).join(", ").slice(0, 500),
      // Billing address on the order so the invoice's address block fills in.
      communicationAddress: [
        addressParts.name, addressParts.street, addressParts.city,
        addressParts.state, addressParts.postalCode, addressParts.country
      ].filter(Boolean).join(", ")
    },
    customToggles: {},
    clientFiles: [],
    todoItems: [],
    workSessions: [],
    assignedToUid: "",
    assignedToEmail: ""
  };

  // The read-only half of the order screen. Kept whole and separate so a
  // resync can refresh it without ever reaching into the studio's own fields.
  const source = {
    provider: "etsy",
    shopId: etsyText(shopId, 40),
    shopName: etsyText(shopName, 200),
    receiptId,
    receiptType: Number(receipt?.receipt_type) || 0,
    status,
    isPaid,
    isShipped: receipt?.is_shipped === true,
    isCancelled,
    isRefunded,
    paymentMethod: etsyText(receipt?.payment_method, 80),
    currency,
    subtotal: subtotal.value,
    discount: discount.value,
    shipping: shipping.value,
    tax: Math.round((tax.value + vat.value) * 100) / 100,
    grandTotal: grand.value,
    buyerUserId: buyerId,
    buyerEmail,
    buyerNote,
    giftMessage,
    personalization: personalizationLines,
    address: addressParts,
    items: transactions.map((transaction) => {
      const price = etsyMoney(transaction?.price);
      const { personalization, options } = splitVariations(transaction?.variations);
      return {
        transactionId: etsyText(transaction?.transaction_id, 40),
        listingId: etsyText(transaction?.listing_id, 40),
        productId: etsyText(transaction?.product_id, 40),
        sku: etsyText(transaction?.sku, 80),
        title: etsyText(transaction?.title, 300),
        quantity: Math.max(1, Math.round(Number(transaction?.quantity) || 1)),
        unitPrice: price.value,
        currency: price.currency || currency,
        isDigital: transaction?.is_digital === true,
        listingImageId: etsyText(transaction?.listing_image_id, 40),
        options,
        personalization
      };
    }),
    createdAtMs: createdAt ? createdAt.getTime() : 0,
    updatedAtMs: (etsyTimestampToDate(receipt?.update_timestamp ?? receipt?.updated_timestamp, null) || createdAt || now).getTime(),
    viewOnEtsyUrl: receiptId && shopId
      ? `https://www.etsy.com/your/orders/sold/completed?order_id=${encodeURIComponent(receiptId)}`
      : ""
  };

  // A digital-only receipt has no production work in the normal sense; the
  // seller decides in the import rules whether it belongs here at all.
  if (source.items.length && source.items.every((item) => item.isDigital)) {
    review.push({ code: "digital_only" });
  }
  if (isCancelled) review.push({ code: "cancelled_at_source" });
  if (!isPaid && status !== "open") review.push({ code: "not_paid", status });

  const customer = {
    name: addressParts.name,
    externalCustomerId: buyerId,
    email: buyerEmail,
    phone: "",
    address: [addressParts.street, addressParts.city, addressParts.postalCode, addressParts.country].filter(Boolean).join(", "),
    streetAddress: addressParts.street,
    city: addressParts.city,
    postalCode: addressParts.postalCode,
    country: addressParts.country,
    shippingAddress: [addressParts.street, addressParts.city, addressParts.postalCode, addressParts.country].filter(Boolean).join(", "),
    shippingStreetAddress: addressParts.street,
    shippingCity: addressParts.city,
    shippingPostalCode: addressParts.postalCode,
    shippingCountry: addressParts.country,
    shippingPhone: ""
  };

  return { order, customer, source, review, createdAt, currency, grandTotal: grand.value };
}

module.exports.etsyText = etsyText;
module.exports.etsyMoney = etsyMoney;
module.exports.etsyTimestampToDate = etsyTimestampToDate;
module.exports.splitVariations = splitVariations;
module.exports.transactionLabel = transactionLabel;
module.exports.normalizeEtsyReceipt = normalizeEtsyReceipt;

/**
 * Why did a signature fail?
 *
 * Standard Webhooks is a small spec with several plausible readings, and our
 * own tests could not tell them apart because the same code signed and
 * verified. This tries each reading against a real delivery and reports which
 * one — if any — Etsy actually used.
 *
 * It returns NAMES ONLY. No secret, no signature, no body ever leaves here:
 * this runs on a production log line.
 */
function diagnoseWebhookSignature({ rawBody, webhookId, webhookTimestamp, webhookSignature, signingSecret }) {
  const secret = String(signingSecret || "");
  const id = String(webhookId || "");
  const ts = String(webhookTimestamp || "");
  const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");

  const keys = {
    "b64(no-prefix)": (() => { try { return Buffer.from(secret.replace(/^whsec_/, ""), "base64"); } catch { return null; } })(),
    "utf8(no-prefix)": Buffer.from(secret.replace(/^whsec_/, ""), "utf8"),
    "utf8(full)": Buffer.from(secret, "utf8"),
    "b64(full)": (() => { try { return Buffer.from(secret, "base64"); } catch { return null; } })(),
    "hex(no-prefix)": (() => { try { return Buffer.from(secret.replace(/^whsec_/, ""), "hex"); } catch { return null; } })()
  };
  const contents = {
    "id.ts.body": `${id}.${ts}.${bodyText}`,
    "ts.body": `${ts}.${bodyText}`,
    "body": bodyText,
    "id.ts.body(compact)": `${id}.${ts}.${(() => { try { return JSON.stringify(JSON.parse(bodyText)); } catch { return bodyText; } })()}`
  };

  const received = String(webhookSignature || "")
    .split(/\s+/)
    .map((part) => (part.includes(",") ? part.slice(part.indexOf(",") + 1) : part))
    .filter(Boolean);

  const matches = [];
  for (const [keyName, key] of Object.entries(keys)) {
    if (!key || !key.length) continue;
    for (const [contentName, content] of Object.entries(contents)) {
      for (const encoding of ["base64", "hex"]) {
        const computed = crypto.createHmac("sha256", key).update(content, "utf8").digest(encoding);
        if (received.some((candidate) => candidate === computed)) {
          matches.push(`${keyName} | ${contentName} | ${encoding}`);
        }
      }
    }
  }

  return {
    matches,
    // Shape only — enough to spot a truncated or mis-pasted secret without
    // revealing any of it.
    secretLength: secret.length,
    secretHasPrefix: secret.startsWith("whsec_"),
    bodyBytes: bodyText.length,
    signatureCount: received.length,
    headerHadComma: String(webhookSignature || "").includes(",")
  };
}

module.exports.diagnoseWebhookSignature = diagnoseWebhookSignature;
