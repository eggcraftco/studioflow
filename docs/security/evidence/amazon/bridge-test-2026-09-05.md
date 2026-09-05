# Bridge verification round — 2026-09-05 (no Amazon credentials involved)

Every result below was read back from the live policy or produced by a live
request; none is inferred from a command's exit code. Nothing was written to
any workspace: the one envelope that passes every layer targets a workspace
that does not exist and stops at the workspace lookup (404).

## IAM as read from the APIs

| Check | Result |
|---|---|
| `ingestAmazonEnvelope` (eggcraft-studio) invoker policy | exactly one binding: `roles/run.invoker` → `amazon-sync@nivadesk-amazon` |
| `allUsers` / `allAuthenticatedUsers` on the bridge | none |
| All 421 Cloud Run services in eggcraft-studio scanned for bindings naming any `nivadesk-amazon` identity or `amazon-caller@` | only the one above |
| eggcraft-studio project-level bindings for Amazon identities | `amazon-caller@`: `datastore.user`, `logging.logWriter` (as designed); none for the four nivadesk-amazon accounts |
| `amazon-admin` (nivadesk-amazon) invoker policy | exactly one binding: `roles/run.invoker` → `amazon-caller@eggcraft-studio` |
| `amazon-admin` ingress | `internal-and-cloud-load-balancing` |
| `amazon-diag` job policy | empty |
| nivadesk-amazon project-level: members outside the four Amazon accounts, the operator and Google service agents | none; compute default account: no binding |
| `intent-hmac-key` accessors | `amazon-oauth@` only (admin and sync do not need it: config.js REQUIRED) |
| `lwa-client-secret` accessors | `amazon-oauth@`, `amazon-sync@`; 0 versions (expected until Amazon issues credentials) |
| custom role `amazonSecretCreator` | `secretmanager.secrets.create` only |
| project-wide unconditional Secret Manager roles | none |

## Live requests

From the internet (operator laptop):

| Request | Result |
|---|---|
| `amazon-admin` run.app `/healthz`, unauthenticated | 404 (ingress; Google front end) |
| `amazon-admin` run.app `/healthz`, operator identity token | 404 — a valid identity does not help from outside |
| `amazon-admin` run.app `/admin/status`, operator identity token | 404 |
| bridge POST, unauthenticated | 403 (Cloud Run IAM) |
| bridge POST, identity token of `amazon-deploy@` (wrong account, no invoker) | 403 (Cloud Run IAM) |
| bridge POST, operator (project owner, passes IAM) | 403 `{"error":"forbidden"}` — the application's identity allowlist refuses anyone but `amazon-sync@` |

From inside `amazon-vpc`, as `amazon-sync@` (Cloud Run job `amazon-bridge-test`, execution `amazon-bridge-test-l6t75`, egress through NAT):

| Case | Result |
|---|---|
| A — valid sanitized envelope, non-existent workspace | 404 `unknown_workspace`: IAM, OIDC identity+audience, allowlist and PII scan all passed; stopped at the workspace lookup, nothing written |
| B — allowlisted envelope plus `order.BuyerEmail` | 422 `unsafe_envelope` — `order.BuyerEmail: not in the allowlist` |
| C — unknown top-level key, missing `taxKnown` | 422 `unsafe_envelope` — `foo: not in the allowlist`, `taxKnown: required boolean` |
| D — token minted for another audience | 401 (Cloud Run IAM) |
| E — no token | 403 (Cloud Run IAM) |

Secret access probes as `amazon-sync@` (HTTP status only; no value is ever printed):

| Secret | Result | Meaning |
|---|---|---|
| `intent-hmac-key` | 403 PERMISSION_DENIED | correct — sync must not read the signing key |
| `lwa-client-secret` | 404 NOT_FOUND | correct — access allowed, no version yet |
| `amazon-refresh-conditiontest` (test secret, dummy value) | 403 PERMISSION_DENIED | **defect**: the conditional grant does not match — see below |

## Finding, then fix: the `amazon-refresh-*` conditions never matched

The first `secrets.sh` wrote three conditional bindings with
`resource.name.startsWith("projects/nivadesk-amazon/secrets/amazon-refresh-")`.
Secret Manager resource names carry the project **number**
(`projects/145308107004/secrets/…`, as `gcloud secrets describe` shows), so the
condition was never true. Effect: no widening — the grants were dead, which
fails closed — but consent (oauth adding a refresh-token version), sync
(reading one) and disconnect (admin deleting one) would all have failed.

Fix, applied by the operator the same day by re-running the corrected
`secrets.sh`: conditions built from the project number, the id-form bindings
removed, and admin's condition-scoped `roles/secretmanager.admin` replaced by
the custom role `amazonRefreshTokenRemover` (`secretmanager.secrets.delete`
only — the one call `connections.js` makes on disconnect). Read back after
the fix: 0 id-form conditions, 0 `secretmanager.admin` bindings,
`amazonSecretCreator` = `secrets.create`, `amazonRefreshTokenRemover` =
`secrets.delete`.

### Runtime proof after the fix (Cloud Run job `amazon-secret-probe`, one execution per identity, from inside `amazon-vpc`; HTTP status only, no value ever printed)

Controls: `amazon-refresh-conditiontest` (dummy, created by the operator) and
`zz-probe-outside-prefix` (dummy, outside the prefix, created by the operator).

| Identity | Call | Result | Expected |
|---|---|---|---|
| `amazon-oauth@` | create `amazon-refresh-probe` | 200 | allowed (custom role, `secrets.create`) |
| `amazon-oauth@` | addVersion `amazon-refresh-probe` | 200 | allowed (condition matches) |
| `amazon-oauth@` | addVersion `zz-probe-outside-prefix` | 403 | refused (outside the prefix) |
| `amazon-oauth@` | access `amazon-refresh-probe` | 403 | refused (oauth writes refresh tokens, never reads them) |
| `amazon-sync@` | access `amazon-refresh-conditiontest` | 200 | allowed |
| `amazon-sync@` | access `amazon-refresh-probe` | 200 | allowed |
| `amazon-sync@` | access `zz-probe-outside-prefix` | 403 | refused |
| `amazon-sync@` | access `intent-hmac-key` | 403 | refused (sync must not hold the signing key) |
| `amazon-sync@` | access `lwa-client-secret` | 404 NOT_FOUND | allowed by IAM; no version yet |
| `amazon-admin@` | access `amazon-refresh-conditiontest` | 403 | refused (admin deletes, never reads) |
| `amazon-admin@` | delete `zz-probe-outside-prefix` | 403 | refused |
| `amazon-admin@` | delete `lwa-client-secret` | 403 | refused (a real secret outside the prefix) |
| `amazon-admin@` | delete `amazon-refresh-conditiontest` | 200 | allowed — and the test secret is gone |
| `amazon-admin@` | delete `amazon-refresh-probe` | 200 | allowed |

Executions: `amazon-secret-probe-shmhw` (oauth), `-vk8wj` (sync), `-47jnd`
(admin). 14 of 14 as expected. Afterwards no secret with the `amazon-refresh-`
prefix remained; the operator deleted `zz-probe-outside-prefix` and the
one-off probe job.

Artifacts kept: Cloud Run job `amazon-bridge-test` (no ingress, no schedule,
costs nothing; re-runnable, and `evidence.sh` reads its newest execution) and
`amazon-diag`.
