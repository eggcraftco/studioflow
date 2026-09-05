# Edge smoke tests — 2026-09-05, after DNS and the managed certificate

Edge: global external HTTPS load balancer `amazon-edge-https` at
**136.68.239.143**, host `amazon.nivadesk.app`, Google-managed certificate
`amazon-edge-cert` (issuer Google Trust Services WR3, ACTIVE), Cloud Armor
policy `amazon-edge` on backend `amazon-admin-backend` (serverless NEG →
Cloud Run `amazon-admin`, ingress `internal-and-cloud-load-balancing`, custom
audience `https://amazon.nivadesk.app`). DNS: Cloudflare A record, DNS-only.

Two vantage points. "Cloud Run IAM" bodies read *Your client does not have
permission…*; Cloud Armor's deny body is the bare *403 Forbidden*.

## From the operator's address (86.162.15.140), laptop

| Request | Result | Layer that answered |
|---|---|---|
| `GET /admin/status`, no token | 403 | Cloud Run IAM |
| `GET /admin/status`, identity token of `amazon-deploy@` for the right audience | 403 `{"error":"forbidden"}` | the application's identity allowlist (see finding) |
| `GET /foo` | 403 | Cloud Armor default deny |
| `GET /oauth/start` | 403 | Cloud Armor default deny (no oauth backend, no rule) |
| `GET /healthz` | 403 | Cloud Run IAM — Cloud Armor rule 3100 let the operator's address through |
| `GET /admin/status?companyId=1' OR '1'='1` | 403 | Cloud Armor rule 1000 (preconfigured WAF, SQLi) |
| direct `run.app` `/admin/status` | 404 | Cloud Run ingress (closed to the internet) |
| `https://136.68.239.143/…` (IP literal, no matching host) | 403 | edge |

## From inside the main project, as `amazon-caller@eggcraft-studio` (Cloud Run job `amazon-edge-smoke`, execution `amazon-edge-smoke-n9gc8`, a Google address — not the operator's)

| Case | Result | Meaning |
|---|---|---|
| A — token for `https://amazon.nivadesk.app`, `GET /admin/status?companyId=zz-edge-smoke` | **200** `{"connections":[]}` | accepted end to end: Cloud Armor → Cloud Run IAM (custom audience) → application OIDC (exact identity + audience) → Firestore over the restricted VIP |
| B — token for `https://example.invalid/not-the-zone` | 401 | Cloud Run IAM refuses a foreign audience |
| C — token for `https://amazon.nivadesk.app/admin` (the old value) | 401 | only the declared custom audience is accepted |
| D — no token | 403 | Cloud Run IAM |
| E — `GET /foo` with the valid token | 403 | Cloud Armor default deny: a valid identity does not open an unlisted path |
| F — `GET /oauth/start` | 403 | Cloud Armor default deny |
| G — `GET /healthz` from a Google address | 403 (Armor body) | rule 3100 is scoped to the operator's address; elsewhere the default deny applies |
| H — direct `run.app` with the valid token | 404 | ingress: even the right identity cannot bypass the edge |

The job was deleted after the run. Nothing was written anywhere: case A reads
an empty connection list for a workspace id that exists nowhere.

## Finding: `amazon-deploy@` passes Cloud Run's IAM check

`roles/run.admin` (and `roles/run.developer`, checked) include
`run.routes.invoke`, so the deploy identity is an invoker of every service in
the zone at the IAM layer. It went no further — the application allowlist
admits only `amazon-caller@` — and the account is used solely through the
operator's impersonation, never by a workload. Least-privilege follow-up:
a custom role for `amazon-deploy@` with the deploy permissions and without
`run.routes.invoke` (an IAM change; the operator applies it).
