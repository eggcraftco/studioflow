# eBay sandbox — step 3: the Hostinger relay key and the portal deletion token (10 September 2026)

Operator's instruction (10 Sep, ~12:55Z): continue with the Hostinger relay key and the portal deletion token step.
Standing rules: no secret value on any surface; the assistant does not enter credentials or tokens into third-party
forms (hPanel, the eBay portal) — the operator pastes; the connector switch stays off; no production eBay connection.

## 1. "Prove B ourselves" — the challenge endpoint answers the hash we can predict (12:56:35Z)

`GET https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications?challenge_code=a9e5d0ff62eafeae`
→ HTTP 200 `{"challengeResponse":"44b9bf29576a99fe5880347a8d8334c472d727ae85d371cb6856b473853aaba7"}`.
Locally, `sha256(code + token + endpointUrl)` with the token read from Secret Manager into a shell variable (64
characters, never printed, unset immediately) produced the **same digest**. So Secret Manager (A) and the running
`ebayNotifications` revision (B) hold the same token, the marker, the version and the accessor binding are all in
place, and the migration's forced order A → B → prove B → C is satisfied up to C (the portal).

## 2. The Hostinger half of the relay key — configured, but not with our value

The web ticket route reads `NIVADESK_EBAY_CALLBACK_KEY` inside the handler and answers **503** while the key is unset or
shorter than 32 characters, **400** when a ticket fails verification (`app/ebay/ticket/route.ts:176-200`). Probes at
12:56–12:58Z against `https://nivadesk.app/ebay/ticket`:

| Request | Answer | Meaning |
|---|---|---|
| `{}` | 400 | body shape refused before the key is read |
| `{"ticket":"abc"}` | **400**, not 503 | a key of ≥ 32 characters **is** configured on Hostinger |
| a ticket minted locally under Secret Manager's `EBAY_CALLBACK_KEY` (`nv1.<state>.<nonceTag>.<expMs>.<jti>.<mac>`, shape-checked against `TICKET_PATTERN`, 5-minute window; the key read via `gcloud secrets versions access` into the node process on stdin, never printed) | **400**, no `Set-Cookie` | the route's key **differs** from Secret Manager's: a valid ticket would have been sealed with 204 + `__Host-nv_ebay_ticket_<tag>` |

Both sides derive the ticket key identically — `HMAC-SHA256(relayKey, "nivadesk/ebay/ticket/v1")` in
`functions/ebayConnector.js:359` and `studioflow-web/lib/studioflow/ebayTicket.ts:43` — and the CI relay job (run
34471692589, "eBay callback (route ↔ function): relay vectors + cited regressions", success 11:31Z) compiles the real
routes against the real function on this tree. So the 400 has one cause: **the value in Hostinger's environment is not
the value generated into `EBAY_CALLBACK_KEY` at 10:50:52Z today.** Round 167's evidence recorded the key as absent on
9 Sep; whatever was set since cannot be today's secret. The deploy plan's row for this state ("set, different value — a
half-finished rotation") applies: every seller flow would end at the ticket route with 400 until the two agree.

**Fix (operator, hPanel):** set `NIVADESK_EBAY_CALLBACK_KEY` for the nivadesk.app site to the current value of the
`EBAY_CALLBACK_KEY` secret (no `NEXT_PUBLIC_` prefix), then redeploy/restart the site so the Node process reads it.
The value is handed over through the clipboard, never through chat:

```
gcloud secrets versions access latest --secret=EBAY_CALLBACK_KEY --project eggcraft-studio | tr -d '\n' | pbcopy
```

**Verification after the redeploy (assistant):** the same minted-ticket probe must answer **204** with a
`__Host-nv_ebay_ticket_…` cookie; `{"ticket":"abc"}` must still answer 400; the deploy plan's §4.3 checks 7/7b
(no `EBAY_` names in client chunks; the literal `process.env.NIVADESK_EBAY_CALLBACK_KEY` still present in the server
chunk) are re-run on the new build.

## 3. The portal deletion token — the endpoint is ready; the form is behind the production keyset

**Where the form is** (eBay's guide *Marketplace User Account Deletion*, "Subscribing" section, read in the signed-in
session 13:0xZ): Application Keys → the *Notifications* link beside the App ID → *Alerts & Notifications* → under **Event
Notification Delivery Method** select the **Marketplace Account Deletion** radio button → e-mail (Save) → Notification
Endpoint URL + Verification token (32–80 characters, `[A-Za-z0-9_-]`) → Save (eBay fires the challenge GET at once) →
*Send Test Notification*.

**What the operator's portal shows today (13:00Z, account `nivadesk`):**

| Environment view | Keyset | *Event Notification Delivery Method* radios | Marketplace Account Deletion form |
|---|---|---|---|
| Sandbox (`/my/push?env=sandbox`) | NivaDesk (the sandbox keyset) | **only** "Platform Notifications (push)" — `device_type=PLATFORM`; no deletion radio in the DOM, visible or hidden | absent; the phrase appears only as the *Learn more* link |
| Production (`/my/push?env=production`) | none — the selector is empty, "Create new keyset" | none | absent |

So the deletion-notification subscription is offered with a **production keyset**, which this account does not have
(*Application Keys* offers "Create Production keyset"). Creating one is the production-credential gate the design keeps
behind sandbox acceptance (`ebay-connector-design.md` owner actions, step 7) and the operator kept out of scope
("Production eBay bağlantısı kurma"). **Not created; nothing was entered or saved in the portal.** The `?env=production`
switch only changed the page view.

**What is ready for that moment:** `ebayNotifications` answers the challenge with the hash eBay will compute (§1), the
token is version 1 of `NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN` (64 hex, inside eBay's rule), the endpoint URL to
enter is exactly `https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayNotifications` (byte-identical to
`deletionEndpointUrl()`), and the registration is a two-field paste by the operator followed by *Send Test Notification*,
whose expected trace is a `ebayDeletionRequests` row reaching `done` — the first behavioural proof of the runtime SA's
own enqueue leg (`ebayNotifications` → `driveDeletion` → the queue → the worker).

## 4. State at the end of this step, and what the operator does next

| Item | State |
|---|---|
| Secret ↔ endpoint token | equal (proved) |
| Hostinger `NIVADESK_EBAY_CALLBACK_KEY` | set to a **different** value than the secret → seller flows would fail at the ticket route; **operator: paste the secret's value in hPanel, redeploy**; then the assistant re-runs the minted-ticket probe (expect 204 + cookie) and the §4.3 chunk checks |
| Portal deletion registration | blocked by the production-keyset gate; endpoint proven ready; nothing entered |
| Connector switch | off; Sandbox OAuth not started |
| Untouched | OpenAI review functions, Stripe/checklist functions, Google case |

Rollback for this step: nothing was created or changed on any system by the assistant; the only pending change is the
operator's Hostinger variable, reversible by setting it back.
