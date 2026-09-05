#!/usr/bin/env bash
# amazon-deploy@ least privilege: a custom role with exactly the permissions a
# deploy needs — create/update/read services and jobs and watch their
# revisions, executions and operations — and none of the ones that make it
# a caller: no run.routes.invoke, no run.jobs.run(WithOverrides), no
# run.instances.invoke, no setIamPolicy, no delete, no ssh.
#
# Why: roles/run.admin and roles/run.developer both include run.routes.invoke,
# so with either the deploy identity could call every service in the zone at
# the IAM layer (2026-09-05: it reached the application's allowlist on
# /admin/status and was refused there). The build-side roles stay as they are
# (logging.logWriter, artifactregistry.writer, objectViewer on the staging
# bucket) and so does cloudbuild.builds.editor; only the Cloud Run role moves.
#
# Consequence for scripts: creating/updating jobs still impersonates
# amazon-deploy@; EXECUTING a job (diag, bridge test) is done by the operator.
# Idempotent. Reads everything back and fails if the outcome is not exact.
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
SA="serviceAccount:amazon-deploy@$PROJECT.iam.gserviceaccount.com"
ROLE_ID="amazonDeployer"
PERMS="run.services.create,run.services.update,run.services.get,run.services.list,run.revisions.get,run.revisions.list,run.routes.get,run.routes.list,run.configurations.get,run.configurations.list,run.operations.get,run.operations.list,run.locations.list,run.jobs.create,run.jobs.update,run.jobs.get,run.jobs.list,run.executions.get,run.executions.list,run.tasks.get,run.tasks.list"

echo "══ 1. custom role $ROLE_ID ══"
if gcloud iam roles describe "$ROLE_ID" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles update "$ROLE_ID" --project="$PROJECT" --permissions="$PERMS" --stage=GA --quiet >/dev/null
  echo "  updated"
else
  gcloud iam roles create "$ROLE_ID" --project="$PROJECT" --title="Amazon zone deployer" \
    --description="Create/update Cloud Run services and jobs and read their state. No invoke, no IAM, no delete." \
    --permissions="$PERMS" --stage=GA --quiet >/dev/null
  echo "  created"
fi

echo "══ 2. bindings: custom role in, run.admin / run.developer out ══"
gcloud projects add-iam-policy-binding "$PROJECT" --member="$SA" --role="projects/$PROJECT/roles/$ROLE_ID" --condition=None --quiet >/dev/null && echo "  + projects/$PROJECT/roles/$ROLE_ID"
for r in roles/run.admin roles/run.developer; do
  gcloud projects remove-iam-policy-binding "$PROJECT" --member="$SA" --role="$r" --condition=None --quiet >/dev/null 2>&1 && echo "  - $r" || true
done

echo "══ 3. read back ══"
bad=0
got=$(gcloud iam roles describe "$ROLE_ID" --project="$PROJECT" --format='value(includedPermissions)' | tr ';' '\n' | sort)
if echo "$got" | grep -qE 'invoke|jobs\.run|setIamPolicy|\.delete$|ssh'; then echo "  ❌ role carries an invoke/IAM/delete/ssh permission"; bad=1; else echo "  ✓ role has no invoke, IAM, delete or ssh permission ($(echo "$got" | wc -l | tr -d ' ') permissions)"; fi
roles=$(gcloud projects get-iam-policy "$PROJECT" --format=json | python3 -c "
import json,sys; p=json.load(sys.stdin)
print('\n'.join(sorted(b['role'] for b in p['bindings'] if '$SA' in b['members'])))")
echo "$roles" | sed 's/^/    /'
echo "$roles" | grep -q "roles/$ROLE_ID" || { echo "  ❌ custom role not bound"; bad=1; }
echo "$roles" | grep -qE 'roles/run\.(admin|developer|invoker)' && { echo "  ❌ a predefined Cloud Run role is still bound"; bad=1; } || echo "  ✓ no predefined Cloud Run role on amazon-deploy@"
[ "$bad" = 0 ] && echo "══ done: amazon-deploy@ can deploy, cannot call ══" || { echo "══ mismatch ══"; exit 1; }
