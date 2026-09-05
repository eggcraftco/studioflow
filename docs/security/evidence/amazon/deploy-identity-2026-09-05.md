# Deploy identity least privilege — 2026-09-05

`amazon-deploy@nivadesk-amazon` held `roles/run.admin`. Both `run.admin` and
`run.developer` include `run.routes.invoke` (checked against the role
definitions), so the deploy identity was a caller of every Cloud Run service
in the zone at the IAM layer: on 2026-09-05 its token for the declared
audience reached `/admin/status` through the edge and was refused only by the
application's identity allowlist (`{"error":"forbidden"}`,
`edge-smoke-2026-09-05.md`).

## Change (infra/amazon/deploy-role.sh, applied 2026-09-05)

Custom role `projects/nivadesk-amazon/roles/amazonDeployer`, 21 permissions:
`run.services.{create,update,get,list}`, `run.jobs.{create,update,get,list}`,
`run.revisions.{get,list}`, `run.routes.{get,list}`,
`run.configurations.{get,list}`, `run.operations.{get,list}`,
`run.executions.{get,list}`, `run.tasks.{get,list}`, `run.locations.list`.
Deliberately absent: `run.routes.invoke`, `run.jobs.run`,
`run.jobs.runWithOverrides`, `run.instances.invoke`, every `setIamPolicy`,
every `delete`, every `ssh*`. `roles/run.admin` removed from the account.
Unchanged: `cloudbuild.builds.editor`, `artifactregistry.writer`,
`logging.logWriter` (project), `storage.objectViewer` on the build staging
bucket, `iam.serviceAccountUser` on the three runtime accounts.

Read back after the change: role has no invoke/IAM/delete/ssh permission;
the account's project roles are exactly `amazonDeployer`,
`artifactregistry.writer`, `cloudbuild.builds.editor`, `logging.logWriter`.
`verify-project.sh` now checks both on every run.

## Deploy smoke test after the change

| Step | Identity | Result |
|---|---|---|
| Cloud Build of the image (`deploy/build.sh`) | build runs as `amazon-deploy@` | built `nivadesk-amazon:6ee4d01f` |
| `gcloud run services replace` for `amazon-admin` | operator impersonating `amazon-deploy@` | new revision ready; direct VPC egress all-traffic verified; `run.app` still 404 from the internet |
| `gcloud run jobs update amazon-diag` | operator impersonating `amazon-deploy@` | updated |
| `gcloud run jobs execute amazon-diag` | the operator (the deploy identity holds no `run.jobs.run` on purpose) | execution `amazon-diag-wzdb9`: diag OK, every Google API host on the restricted VIP |

## Proof: the deploy identity is now refused at Cloud Run's IAM layer

`GET https://amazon.nivadesk.app/admin/status?companyId=zz-deploy-probe` with an
identity token of `amazon-deploy@` for audience `https://amazon.nivadesk.app`:

- before the change: 403 `{"error":"forbidden"}` — the application answered,
  i.e. Cloud Run IAM had admitted the caller;
- after the change: 403 *Your client does not have permission to get URL* —
  Cloud Run IAM refused it; the request never reached the service.

`evidence.sh` repeats this probe live (`deploy-identity.txt`).
