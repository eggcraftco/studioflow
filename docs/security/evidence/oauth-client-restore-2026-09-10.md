# ChatGPT OAuth client record restored — 10 September 2026, 08:45 UTC

Operator-approved (option A of `oauth-client-restore-package-2026-09-10.md`). One document created; nothing
else written, no IAM, no code, no deploy. Verified with the real ChatGPT client, not the smoke client.

## 1. What was written

| | |
|---|---|
| Project / database | `eggcraft-studio` / `(default)` |
| Document | `chatgptOAuthClients/chatgpt_vBKvJEcc8whYjwGEY8sg_pZX` |
| Method | `DocumentReference.create()` — fails on an existing document; it did not exist (read immediately before: `exists: false`) |
| Time | **2026-09-10T08:45:20.977Z** (`restoredAtMs: 1789029920977`; `restoredAt` server timestamp 08:45:21.081Z) |
| Pre-write source check | `chatgptOAuthCodes` for this client: 32 codes, 30 consumed, 2026-06-22 → 2026-09-03, one distinct `redirectUri` — the value written |

Fields, all of them (the record carries no secret; none was ever issued for this client):

```
clientId          "chatgpt_vBKvJEcc8whYjwGEY8sg_pZX"
redirectUris      ["https://chatgpt.com/connector/oauth/AaMpjPuGGHRX"]          ← the only field the runtime reads
restoredAt        <server timestamp>
restoredAtMs      1789029920977
restoredFrom      "chatgptOAuthCodes: 32 authorization codes for this client (30 consumed), 2026-06-22..2026-09-03, all with this single redirectUri"
restoredEvidence  "docs/security/evidence/oauth-client-restore-package-2026-09-10.md"
restoredNote      "Registration predates the client store introduced by 14ff0cfb (2026-09-03); the record was never written, not deleted. Operator-approved restore, 2026-09-10."
```

Deliberately **not** written: `scope`, `tokenEndpointAuthMethod`, `grantTypes`, `responseTypes`, `clientName` —
none is read by any code path; no assumption was stored. No wildcard; the redirect check itself is unchanged
(`isRegisteredRedirectUri`: exact match — a read-only mirror right after the write returned `true` for the restored
URI and `false` for another URI, a sub-path and a query variant).

## 2. The real ChatGPT flow, after the write

Normal UI only: ChatGPT (the operator's account) → Settings → Plugins → NivaDesk → **Yeniden bağlan** (Reconnect).
The consent page opened already signed in as `review@nivadesk.app` (existing browser session; no password, no MFA);
workspace "My Studio · owner" was selected; **Allow ChatGPT** was pressed. ChatGPT's callback then completed the
exchange on its own.

| Step | Log (Cloud Run, europe-west2) | Firestore |
|---|---|---|
| authorize | `chatgptoauthauthorize-00045-has` GET **302** at 08:47:00.628Z — no refusal line since the write | |
| approve | `chatgptoauthapprove-00044-wej` POST **200** at 08:47:32.281Z | one new `chatgptOAuthCodes` record at 08:47:33.006Z: `redirectUri` = the restored value, `consumed: true`, workspace `KSQidetb3oOSItE9amLISf9Lh6h2`, PKCE `S256`, six scopes |
| token | `chatgptoauthtoken-00045-sup` POST **200** at 08:47:34.917Z | one new `chatgptOAuthTokens` record at 08:47:37.765Z for that workspace, expires 2026-10-10, not revoked |
| read-only tool call from the same chat | `chatgptmcp-00073-fuz` POST **200** ×2 — `search_orders` (08:49:30.455Z, `ok:true`) and `get_order_financials` (08:49:34.883Z, `ok:true`) | two `piiAccessLog` rows in the review workspace, `actorRole: chatgpt_connection`, `source: mcp`, subject kind `order`, one record each |

ChatGPT's answer named the review order with status In Progress, paid £5,300, remaining £900, total £6,200 — the
figures the test cases state. No token, password, authorization code or PKCE verifier is reproduced here.

## 3. What is now true

- ChatGPT's cached client for the published app passes the redirect check again; new and renewed connections
  work. The 8 pre-existing valid tokens were never affected.
- The client record is exactly the one document above; the smoke client from the night is the only other
  record in the collection.

## 4. Remaining

- Scan Tools, the platform form and Submit: **not touched**; separate step.
- Two other pre-4-Sep client ids seen in old code records (`chatgpt_qWAV…`, `chatgpt_NQj4…`) were **not** restored:
  nothing sends them today. If either ever appears in a refusal, it needs its own evidence pass; no automatic add.
- If ChatGPT ever sends a different redirect URI for this client, it is refused as `unregistered_redirect_uri` and
  shows in the log; that is a finding to review, not something to add.
- Cloud Logging keeps 30 days; nothing is claimed about before 2026-08-11.

## 5. Rollback — only if the record is still exactly the one created

Read the document; proceed only if `restoredAtMs === 1789029920977` and the field set is the seven fields above
(anything else means somebody changed it since, and this note no longer describes it). Then delete that one
document. Effect: ChatGPT connects are refused again as before the write; existing tokens keep working until they
expire; codes, tokens and other client records are untouched either way.

```js
const ref = admin.firestore().collection("chatgptOAuthClients").doc("chatgpt_vBKvJEcc8whYjwGEY8sg_pZX");
const snap = await ref.get();
if (snap.exists && snap.data().restoredAtMs === 1789029920977 && Object.keys(snap.data()).length === 7) await ref.delete();
```

## 6. Corrections to earlier statements

- "registered 21 Aug" (night note `oauth-client-registry-gap-2026-09-10.md` §1, night report row 1): the client's
  first authorization code is dated **2026-06-22**; it was registered on or before that date, outside log
  retention. The 21 Aug registration is a different, unused id.
- "the record was lost/deleted": it was **never written** — registration was stateless before `14ff0cfb`, point-in-
  time reads of the collection on 3–4 Sep are empty, no TTL, no cleanup path.
- "every connect since 4 Sep failed": true **within the 30-day log window** (2026-08-11 → 2026-09-10) for
  authorize/approve/token; existing tokens kept working throughout.
