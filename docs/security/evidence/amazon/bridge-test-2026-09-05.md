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

## Finding: the `amazon-refresh-*` conditions never match

`secrets.sh` wrote three conditional bindings with
`resource.name.startsWith("projects/nivadesk-amazon/secrets/amazon-refresh-")`.
Secret Manager resource names carry the project **number**
(`projects/145308107004/secrets/…`, as `gcloud secrets describe` shows), so the
condition is never true. Effect: no widening — the grants are dead, which
fails closed. It would have broken the OAuth consent (oauth cannot add a
refresh-token version), the sync (cannot read one) and disconnect (admin
cannot delete one). `secrets.sh` now builds the condition from the project
number and removes the dead bindings; the probe above is re-run after it.

Test artifacts: Cloud Run job `amazon-bridge-test` (no ingress, runs only when
executed) and secret `amazon-refresh-conditiontest` (dummy value) — both to be
deleted once the corrected `secrets.sh` has been verified.
