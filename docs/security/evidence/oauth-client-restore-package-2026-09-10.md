# Restoring ChatGPT's OAuth client record — repair package (10 September 2026, morning)

Companion to `oauth-client-registry-gap-2026-09-10.md` §5. **Nothing was written.** Every fact below was read
tonight, read-only, from the production project; the package is the exact write, its precondition, its
rollback and the check that follows it. One correction to the gap note is in §3.

## 1. The environment and the gap, verified

| Question | Answer | How it was read |
|---|---|---|
| Which client id does ChatGPT send? | `chatgpt_vBKvJEcc8whYjwGEY8sg_pZX` — the only client id in any refusal in the 30-day log window, and the id in the platform's own Scan Tools request tonight | `chatgptoauthauthorize` log lines "refused a redirect_uri: unregistered_client <id> <uri>", 2026-08-11 → 2026-09-10; the platform's authorize URL |
| Where is it looked up? | project `eggcraft-studio`, the only Firestore database `(default)` (Native, PITR on), collection `chatgptOAuthClients`, document id = the client id | `functions/index.js` `nvChatGPTOAuthClientsRef` / `nvOAuthRegisteredRedirects` (the only reader); `gcloud firestore databases list` → one database |
| Is it "missing" or "wrong environment / other key / disabled / expired"? | **Missing.** The collection holds exactly one document (this session's `curl` smoke client, created 10 Sep 01:04). The code has no `disabled`/`expiresAt` on client records and no delete path; no TTL policy on the collection (`gcloud firestore fields ttls list` → 0); no other database | Firestore read of the collection; `grep` of every reference to the collection in `functions/` |
| Was it deleted, or never there? | **Never there.** Point-in-time reads of the collection at 2026-09-03 20:00 UTC and 2026-09-04 00:00 UTC both return 0 documents; the register handler before `14ff0cfb` (3 Sep) minted an id and echoed the request back without writing anything (read from `git show 14ff0cfb~1:functions/index.js`) | PITR `runTransaction({readOnly, readTime})`; git |
| Log coverage of "every connect refused since 4 Sep" | Cloud Logging retention is **30 days**: the observed window is 2026-08-11 → 2026-09-10; queries used `--limit 1000` and returned far fewer rows, so nothing was cut. `chatgptoauthauthorize` GETs by day: 302s on 13 Aug–3 Sep (one 400 on 18 Aug); from 4 Sep only 400s (6, 2, 2, 5, 1, 2 on 4/6/7/8/9/10 Sep) plus this session's two smoke 302s on 10 Sep. `chatgptoauthapprove` since 4 Sep: one 200 (smoke). `chatgptoauthtoken` since 4 Sep: two 400s on 6 Sep (the audit's curl negatives), one 200 (smoke). **Claim, bounded:** within the window, no authorize with ChatGPT's client id has passed since 4 Sep, and no approve/token has succeeded for it. Nothing is claimed about before 11 Aug | `gcloud logging read` with the windows above; `gcloud logging buckets describe _Default` |
| Who is still connected? | 30 token records for the client; **8 still valid** (latest expiry 2026-10-02) across 6 workspaces — existing connections keep working until they expire; only new or renewed connections fail | `chatgptOAuthTokens` read, secrets not read |

## 2. Where the restored values come from

The live code enforces **one field** of a client record: `redirectUris` (`nvOAuthRedirectAllowed` →
`nvOAuthRegisteredRedirects`, `functions/index.js:25352-25376`; the only other reference to the collection is the
register handler's own write). The token endpoint does not read the record at all: it requires `code`,
`redirect_uri`, `client_id` and a PKCE `code_verifier`, and compares the first three against the code record
`nvOAuthCreateCodeRecord` wrote at approve time. No client secret exists: the register handler has never issued
one (before or after `14ff0cfb`), so there is no secret to restore or to show.

| Field | Value to write | Source (not a failed request, not memory) |
|---|---|---|
| document id / `clientId` | `chatgpt_vBKvJEcc8whYjwGEY8sg_pZX` | 32 authorization-code records and 30 token records name it, 2026-06-22 → 2026-09-03; the refusals and the platform request tonight send it |
| `redirectUris` | `["https://chatgpt.com/connector/oauth/AaMpjPuGGHRX"]` — exact string, no wildcard | **every one of the 32 code records** the server minted for this client at approve time carries this single value, and 30 of them were consumed (the token was exchanged), i.e. ChatGPT received the code at that address and came back with it; two other client ids that ChatGPT registered for the same app (`chatgpt_qWAV…`, `chatgpt_NQj4…`) carry the same callback. The refusal logs show the same string byte for byte; they are corroboration, not the source |
| `clientName` | `"ChatGPT"` | the register handler's default (informational; read nowhere) |
| `scope` | `""` | informational; read nowhere. The scopes a connection gets come from the authorize request and the flag, not from the record |
| `tokenEndpointAuthMethod` | `"none"` | informational (read nowhere). Consistent with the facts: no secret was ever issued, the token endpoint authenticates by PKCE only, and ChatGPT's own earlier client id for this server was the metadata URL `https://chatgpt.com/oauth/NhrAh3bfI6up/client.json?token_endpoint_auth_method=none` (15 code records, May–June) |
| `grantTypes` / `responseTypes` | `["authorization_code"]` / `["code"]` | informational; the only grant the token endpoint accepts (`unsupported_grant_type` otherwise) and the only response type the authorize endpoint implements |
| `createdAt`, `createdAtMs`, `userAgent`, `restoredFrom` | now; `"restored 2026-09-10 from chatgptOAuthCodes (32 codes, 30 consumed, 2026-06-22..2026-09-03)"` | provenance stamp so the record explains itself |

**No field is guessed.** The one enforced field comes from thirty completed authorizations; the informational
fields are the handler's own defaults and are labelled as restored.

## 3. Root cause, and one correction

`14ff0cfb` (3 Sep 2026, live 4 Sep) introduced the store and the check together; registration before it was
stateless, so every client ChatGPT had already registered had no record to find. No TTL, no cleanup, no
migration, no environment change: the record was never written. Recurrence: only a client registered before
4 Sep can hit this; the three such ids seen in the code records are `chatgpt_vBKv…` (in use), `chatgpt_qWAV…`
(2 uses, last 21 Aug) and `chatgpt_NQj4…` (1 use, 21 Aug); only the first is being sent today.

**Correction to `oauth-client-registry-gap-2026-09-10.md` §1:** the client was **not** registered on 21 Aug.
Its first authorization code is dated **2026-06-22**, so it was registered on or before that day — outside log
retention, which is why no registration log for it exists. The 21 Aug `201` from `Python/3.12 aiohttp` is a
different registration whose id the logs do not carry (most likely `chatgpt_NQj4…`, which minted its one code
that day); it is not the client in use and needs nothing.

## 4. Options

| | |
|---|---|
| **A — restore the record (recommended)** | The enforced value is known from thirty completed flows; the write is one document, created only if absent, reversible by one delete; it makes ChatGPT's cached client valid again for every user and for the platform's Scan Tools |
| B — normal re-registration | Not available from our side: ChatGPT keeps the registration per app and does not re-register on our 400 (six days of identical refusals), and the platform's Advanced settings show *"Client registration is locked after OAuth setup completes"* with DCR greyed out. A fresh registration would need OpenAI to reset the app's OAuth setup or a new app listing — a separate conversation, and no faster |

## 5. The write, its precondition, its rollback, its check

**Precondition:** `chatgptOAuthClients/chatgpt_vBKvJEcc8whYjwGEY8sg_pZX` does not exist. The write uses
`DocumentReference.create()`, which **fails if the document exists** — an existing record is never overwritten.
Read the document first; if it exists, stop and read it instead.

**Diff (no secrets exist for this record):**

```
+ chatgptOAuthClients/chatgpt_vBKvJEcc8whYjwGEY8sg_pZX
+   clientId:                "chatgpt_vBKvJEcc8whYjwGEY8sg_pZX"
+   redirectUris:            ["https://chatgpt.com/connector/oauth/AaMpjPuGGHRX"]
+   clientName:              "ChatGPT"
+   scope:                   ""
+   tokenEndpointAuthMethod: "none"
+   grantTypes:              ["authorization_code"]
+   responseTypes:           ["code"]
+   createdAt:               <serverTimestamp>
+   createdAtMs:             <now>
+   userAgent:               "restored 2026-09-10 from chatgptOAuthCodes (32 codes, 30 consumed, 2026-06-22..2026-09-03)"
+   restoredFrom:            "docs/security/evidence/oauth-client-restore-package-2026-09-10.md"
```

Built through `oauth/redirects.js` `clientRecord()` so the stored shape is byte-identical to what the register
handler writes today (the normalizer keeps the https URI as is):

```js
// run from functions/ with ADC as the operator; project eggcraft-studio, database (default)
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "eggcraft-studio" });
const { clientRecord } = require("./oauth/redirects.js");
const ref = admin.firestore().collection("chatgptOAuthClients").doc("chatgpt_vBKvJEcc8whYjwGEY8sg_pZX");
const record = clientRecord({ clientId: ref.id, redirectUris: ["https://chatgpt.com/connector/oauth/AaMpjPuGGHRX"],
  clientName: "ChatGPT", scope: "", tokenEndpointAuthMethod: "none", grantTypes: ["authorization_code"], responseTypes: ["code"] });
await ref.create({ ...record, createdAt: admin.firestore.FieldValue.serverTimestamp(), createdAtMs: Date.now(),
  userAgent: "restored 2026-09-10 from chatgptOAuthCodes (32 codes, 30 consumed, 2026-06-22..2026-09-03)",
  restoredFrom: "docs/security/evidence/oauth-client-restore-package-2026-09-10.md" });   // throws ALREADY_EXISTS if present
```

**Rollback:** `ref.delete()` — one document; refusals resume exactly as before; no token, code or workspace
record is touched either way.

**Check, in this order, with the real ChatGPT client (the smoke client is not a substitute):**
1. Read-only mirror right after the write: `nvOAuthRedirectAllowed(id, uri)` semantics reproduced locally must
   return `ok:true` for the restored URI and `unregistered_redirect_uri` for any other.
2. The operator reconnects the review account to the **published NivaDesk app in ChatGPT** (normal UI). Expect
   in the logs, for `client_id=chatgpt_vBKv…`: `chatgptoauthauthorize` **302**, `chatgptoauthapprove` **200**,
   `chatgptoauthtoken` **200**; a new `chatgptOAuthCodes` record with the restored `redirectUri`, consumed; a
   new `chatgptOAuthTokens` record for the review workspace.
3. One authenticated **read-only** call from that ChatGPT connection (for example "search my orders for
   Review Test Order"): `chatgptmcp` **200** and one `piiAccessLog` row in the review workspace — proving the
   token the real client obtained is accepted by the MCP surface.
4. Only then: Scan Tools on the draft (separate approval).

## 6. What remains uncertain

- Whether ChatGPT would ever send a second redirect URI for this client. Thirty completed flows say one; if
  another appears it is refused as `unregistered_redirect_uri` and shows in the log — no wildcard is added.
- The id the 21 Aug registration produced (§3). Not needed for the repair.
- Nothing about traffic before 11 Aug: outside retention.

**GO / NO-GO for the write: GO**, on the operator's word — one `create()` with the values in §5, then the
check in §5 with the real client. NO-GO for anything wider: no IAM, no Scan Tools, no form change, no Submit.
