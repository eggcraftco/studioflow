# nivadesk-amazon

NivaDesk's Amazon connector, deployed alone in the `nivadesk-amazon` Google
Cloud project — the hardened boundary designed in
`docs/security/amazon-hardened-project-design.md`. It holds Amazon Information
(connections, refresh tokens, the sanitized half of orders) and lets exactly
one thing out: a schema-allowlisted, sanitized envelope to the main project.

**Status:** code and specs only. The project does not exist yet; creating it
is a sign-off gate (`infra/amazon/create-project.sh`, `DRY_RUN=1` by default).

## Shape

One container image, three Cloud Run services selected by `ROLE`:

| Service | Role | Reached by | Does |
|---|---|---|---|
| `amazon-oauth` | `oauth` | the seller's browser, via the load balancer | `/oauth/start` verifies the main project's signed connect intent and sends the seller to Login with Amazon; `/oauth/callback` exchanges the code, stores the refresh token in Secret Manager, discovers marketplaces, sends the browser home with a status word |
| `amazon-admin` | `admin` | the main project, via the load balancer, with an OIDC token for `amazon-caller@eggcraft-studio` | `/admin/status`, `/admin/disconnect`, `/admin/sync-now` |
| `amazon-sync` | `sync` | Cloud Scheduler, every 30 minutes, with an OIDC token for `amazon-sync@` | Orders API v2026-01-01 without BUYER/RECIPIENT/TAX → `sanitize.js` → `envelope.js` → the bridge |

`src/` is plain Node 22 with `firebase-admin` (Firestore) and
`@google-cloud/secret-manager`. Every module takes its dependencies injected
and is tested without a project. `src/amazon/` is the SP-API client, the LWA
flow, the sanitizer and the marketplace table — moved from the main codebase
unchanged.

## The four rules the code enforces

1. **Nothing personal leaves.** `sanitize.js` removes every field known to
   carry a person; `envelope.js` allows only the fields known to carry the
   sale. Both run before anything is sent, and the main project runs the
   allowlist again before it believes anything. The two copies of
   `envelope.js` are tested byte-for-byte identical.
2. **Nothing personal is stored.** Phase A1 asks Amazon for no buyer data.
   If a response carries some anyway it is an anomaly: removed, logged as
   paths, never as values, and the order is not stored.
3. **One door out.** `egress.js` refuses any host but the SP-API regional
   hosts, Login with Amazon and the bridge endpoint, and logs host, method,
   status and duration — never a path, never a header.
4. **Nobody is trusted by position.** The browser carries an HMAC-signed,
   single-use, ten-minute intent; every non-browser caller carries an OIDC
   token for one exact identity and one exact audience.

## Running the tests

```bash
npm install
npm test
```

## Deploying — in order, and not before the gates

1. `infra/amazon/create-project.sh` — ⛔ gate. Org policies, APIs, service
   accounts, VPC/subnet/firewall/NAT/static IP, Firestore, empty secrets,
   Artifact Registry, the 400-day log bucket.
2. The user adds the two secret values in the console (`lwa-client-secret`,
   `intent-hmac-key`). Never through chat.
3. `deploy/deploy.sh` — builds the image in the project, releases the
   deny-all Firestore rules, deploys the three services from
   `deploy/service-*.yaml`, and proves each `run.app` address answers 403.
4. `deploy/secrets.sh` — secret-level IAM. `deploy/scheduler.sh` — the tick.
5. `infra/amazon/create-edge.sh` — load balancer, certificate, Cloud Armor
   (⛔ DNS gate).
6. SCC Premium (⛔), VPC-SC dry-run → enforce (⛔).

Every `service-*.yaml` states the settings the design depends on — gen2,
`internal-and-cloud-load-balancing`, direct VPC egress through `amazon-vpc`,
its own service account, secrets mounted from Secret Manager — so the spec is
the evidence.
