# ChatGPT's OAuth client has no registration record — every connect refused since 4 Sep 2026

Date found: 10 September 2026, 01:36 UTC, while running Scan Tools on the 1.2.0 draft in the OpenAI
platform. Severity: **HIGH** — a live production regression of the published app's connect flow, not a
security hole. Nothing in this note was changed in production; §5 is the proposed fix for the operator.

> **Correction, 10 Sep morning** (`oauth-client-restore-package-2026-09-10.md` §3): the client was not registered on
> 21 Aug — its first authorization code is dated 2026-06-22, so it predates log retention; the 21 Aug registration is a
> different, unused id. Everything else in this note stands; the repair package supersedes §5.

## 1. What happens

The OpenAI platform (Scan Tools) and ChatGPT (Add/Reconnect NivaDesk) send every authorize request with
the client id they registered on **21 Aug 2026 15:51:47 UTC** (`chatgptOAuthRegister` answered `201`,
user agent `Python/3.12 aiohttp/3.13.5` — the only non-curl registration in the last 45 days of logs).

Since `14ff0cfb` ("An authorization code can only go where the client registered it", 3 Sep 2026,
audit finding #1, live from 4 Sep) `chatgptOAuthAuthorize` and `chatgptOAuthApprove` look the client id
up in `chatgptOAuthClients` and refuse an id with no record:

```
{"ok":false,"error":"invalid_request","message":"This client is not registered. Start the connection again from ChatGPT."}
```

Before `14ff0cfb`, registration stored nothing (the commit message says so), so the 21 Aug registration
has no record to find. The collection holds exactly one document today — the smoke client this session
registered with a localhost callback at 01:04 UTC — and nothing for OpenAI's id.

OpenAI does not re-register on this error. The platform's Advanced settings say: *"This app already has an
OAuth client. Client registration is locked after OAuth setup completes."* (registration method DCR,
registration URL `https://mcp.nivadesk.app/chatgptOAuthRegister`, greyed out).

## 2. Evidence (Cloud Logging, project eggcraft-studio, europe-west2)

`chatgptOAuthAuthorize refused a redirect_uri: unregistered_client <client id> https://chatgpt.com/connector/oauth/<callback id>`
— the same client id and the same callback every time:

| day (UTC) | refused authorize requests | successful consent starts (302) |
|---|---|---|
| 20 Aug – 3 Sep | 0 | 1, 6, 2, 1, 3, 2, 1, 2, 1, 1 (daily) |
| 4 Sep | 6 | 0 |
| 5–6 Sep | 0 | 0 |
| 7 Sep | 2 | 0 |
| 8 Sep | 5 | 0 |
| 9 Sep | 1 | 0 |
| 10 Sep | 1 (the Scan Tools attempt, 01:36:42) | 2 (the session's smoke client, separate id) |

Registration endpoint, POST, last 45 days: `2026-08-21 15:51:47 201 Python/3.12 aiohttp/3.13.5`,
`2026-09-06 01:34 / 01:49 400 curl` (the audit's negative tests), `2026-09-10 01:04 201 curl` (smoke).

So: not one ChatGPT connect or reconnect has completed since the redirect check went live. Existing
30-day tokens keep working (the token check is separate), which is why the review account's earlier
connection kept answering until it expired; the "23 pre-flip grants need reconnect" note in the 1.2.0
deploy record now has this in front of it as well.

## 3. What it blocks tonight

- **Scan Tools** on the 1.2.0 draft (`asdk_app_v_6aa205eb…`): the platform opened
  `chatgptOAuthAuthorize?client_id=<the 21 Aug id>&redirect_uri=https://chatgpt.com/connector/oauth/…&scope=<six scopes>&code_challenge_method=S256`
  and got the refusal above. Without a scan the platform shows no tool list and no justification
  fields, and the Submit page lists "MCP tools scan is required".
- **Reconnecting the review account in ChatGPT** through the normal UI — same client id, same refusal.
- **Every real user** who tries to add or reconnect NivaDesk in ChatGPT.

## 4. Root cause, precisely

`14ff0cfb` introduced the store and the check together, with no record for clients registered while
registration was stateless. The check is right; the migration for the one client that mattered was
missing. There is no code path by which OpenAI's cached client can ever pass again unless a record with
its id exists.

## 5. Proposed fix (operator decision — one document, reversible)

Write one document to `chatgptOAuthClients`, shaped by `oauth/redirects.js` `clientRecord()`:

```
id:          the client id OpenAI sends (see the refused-authorize log lines; it starts with chatgpt_vBKv)
redirectUris: ["https://chatgpt.com/connector/oauth/<the callback id in the same log lines>"]
clientName:  "ChatGPT"
scope:       ""
tokenEndpointAuthMethod: "none"
grantTypes:  ["authorization_code"]
responseTypes: ["code"]
createdAt / createdAtMs: now
userAgent:   "restored 2026-09-10 — registered 2026-08-21T15:51:47Z by Python/3.12 aiohttp/3.13.5"
```

- The redirect URI is the one and only destination OpenAI has ever sent with this id (every refused
  request in §2 and the platform's own request tonight). Exact-match; nothing else is admitted.
- Security effect: identical to the registration OpenAI made on 21 Aug had it been stored — the redirect
  check then binds this id to chatgpt.com's callback exactly as it does for every client registered
  after 4 Sep. Anonymous dynamic registration can already create such a binding for a *new* id; what
  only we can do is bind the id OpenAI caches.
- Rollback: delete the one document. No deploy, no code change, no flag.
- After the write: re-run Scan Tools on the draft; reconnect the review account in ChatGPT; expect the
  daily 302s in `chatgptoauthauthorize` to return.

Not done tonight because it is a production write to an auth collection and the night authorization
covers deploys by name, not auth-store changes. Everything else on the draft (§ night report) is filled
and saved; the scan and the per-tool justification fields wait on this.

## 6. Follow-up worth a separate look

A registration that OpenAI holds forever while we can lose the record is brittle. Two options for a later
change: (a) return an OAuth error at the token endpoint that makes ChatGPT re-register (behaviour not
documented by OpenAI, would need a test), or (b) keep an allowlist of OpenAI's callback origin for ids we
issued but cannot find — weaker than exact registration, so only with the operator's eyes on it.
