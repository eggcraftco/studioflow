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

## 2. The Hostinger half of the relay key — absent, and the first reading of the probes was wrong

**Corrected reading (13:05–13:10Z).** hPanel → nivadesk.app → *Ortam değişkenleri* lists nine variables, all
`NEXT_PUBLIC_FIREBASE_*` plus `NEXT_PUBLIC_STAGING_NO_INDEX`; **`NIVADESK_EBAY_CALLBACK_KEY` is not among them.** The
earlier probes answered 400 not because a different key was configured but because the ticket route's first gate is
same-origin (`app/ebay/ticket/route.ts:142-146`: `Sec-Fetch-Site: same-origin`, or `Origin` equal to
`https://nivadesk.app`) — the probes carried neither, were counted as `blocked` (Hostinger runtime log:
`ebay ticket route window=… sealed=0 refused=0 throttled=0 blocked=3`, exactly the three probes) and never reached the
key check. With `Origin: https://nivadesk.app` the route answers **503** for a ticket-shaped body — the designed
"key not configured" answer. The paragraph that stood here for a few minutes ("configured, but not with our value") is
withdrawn; nothing was acted on under it.

**Fix (operator, hPanel, in progress):** add `NIVADESK_EBAY_CALLBACK_KEY` = the current value of the `EBAY_CALLBACK_KEY`
secret (no `NEXT_PUBLIC_` prefix), then *Yeniden Dağıt* so the Node process restarts with it. The value travels through
the clipboard only (`gcloud secrets versions access latest --secret=EBAY_CALLBACK_KEY … | pbcopy`, confirmed as a
64-character hex value on the clipboard without displaying it); the assistant typed the variable *name* into the add
dialog and left the value field to the operator.

**Done and verified (13:10–13:16Z).** The operator pasted the value into the *Değer* field and pressed *Ekle*
(13:11Z, unsaved-changes badge → the variable listed, 10 variables); *Değişiklikleri uygula* (pressed by the assistant on
the operator's word) started deployment `01a08b72-e06a-70da-b0c3-10009d61780d` automatically — same commit
`4e3a05f7` (Round 170), branch `main`, Next.js 22.x runtime — which finished **Tamamlandı** at 14:14 local (13:14Z),
2 m 22 s. The same-origin probe flipped from 503 to **400** at 13:15:00Z.

| Check after the redeploy | Result |
|---|---|
| `{"ticket":"abc"}` with `Origin: https://nivadesk.app` | **400** — key present, ticket invalid (was 503) |
| a ticket minted locally under Secret Manager's `EBAY_CALLBACK_KEY` (5-minute window; key on stdin, never printed) | **204**, `Set-Cookie: __Host-nv_ebay_ticket_<tag>=…; Max-Age=300; Path=/; Secure; HttpOnly; SameSite=Lax` — the route derives the same ticket key as the function: **Hostinger's value equals the secret** |
| the same ticket with its MAC's last three characters changed | **400** — verification is real |
| deploy plan §4.3 step 7 — client bundle: the 12 chunks referenced by `/ebay/start` and the page HTML | 0 mentions of `NIVADESK_EBAY_CALLBACK_KEY` / `EBAY_CALLBACK_KEY` / `x-nivadesk-signature`; 0 occurrences of the key's value (counted, never printed) |
| deploy plan §4.3 step 7b — the key is read at runtime, not inlined at build time | proven behaviourally: the build is the unchanged Round 170 commit, and the route's answer changed from 503 to 400/204 purely through the environment |

Hostinger runtime log before the fix (read in hPanel): `ebay ticket route window=… sealed=0 refused=0 throttled=0
blocked=3` and two `ebay ticket: refused` lines — the operator's three cross-origin probes; nothing else.


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
| Hostinger `NIVADESK_EBAY_CALLBACK_KEY` | **set and verified equal to the secret** (deployment 01a08b72, 13:14Z): bad ticket 400, minted ticket 204 + `__Host-` cookie, tampered 400, no key name/value in client chunks |
| Portal deletion registration | blocked by the production-keyset gate; endpoint proven ready; nothing entered |
| Connector switch | off; Sandbox OAuth not started |
| Untouched | OpenAI review functions, Stripe/checklist functions, Google case |

Rollback for this step: the only change is the Hostinger variable `NIVADESK_EBAY_CALLBACK_KEY` (+ the automatic redeploy of the
unchanged Round 170 commit); reversible by deleting the variable in hPanel and applying, after which the ticket route
answers 503 again and no seller can start a flow. Nothing else was created or changed.
