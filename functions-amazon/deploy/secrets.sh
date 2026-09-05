#!/usr/bin/env bash
# Secret-level IAM — the narrowest grants that let each service do its one job.
#
#   amazon-oauth  reads lwa-client-secret and intent-hmac-key; creates and adds
#                 versions to amazon-refresh-* (a refresh token per connection)
#   amazon-sync   reads lwa-client-secret and amazon-refresh-*
#   amazon-admin  deletes amazon-refresh-* (disconnect) — one permission, secrets.delete
#
# Nothing here reads a secret's value. The values of lwa-client-secret and
# intent-hmac-key are added by the user in the console, never through chat.
set -euo pipefail
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
OAUTH="serviceAccount:amazon-oauth@$PROJECT.iam.gserviceaccount.com"
SYNC="serviceAccount:amazon-sync@$PROJECT.iam.gserviceaccount.com"
ADMIN="serviceAccount:amazon-admin@$PROJECT.iam.gserviceaccount.com"

bind_secret() { gcloud secrets add-iam-policy-binding "$1" --project="$PROJECT" --member="$2" --role="$3" --quiet >/dev/null; echo "  $1 ← $3 → ${2#serviceAccount:}"; }
bind_secret lwa-client-secret "$OAUTH" roles/secretmanager.secretAccessor
bind_secret intent-hmac-key   "$OAUTH" roles/secretmanager.secretAccessor
bind_secret lwa-client-secret "$SYNC"  roles/secretmanager.secretAccessor

# Per-connection refresh tokens do not exist yet when this runs, so the grant
# is project-level with an IAM condition on the resource name prefix: it
# applies to amazon-refresh-* and to nothing else in Secret Manager.
#
# The prefix carries the project NUMBER: Secret Manager resource names are
# projects/<number>/secrets/<id>, and a condition written with the project id
# never matches (verified 2026-09-05 with a probe as amazon-sync@: 403 on a
# test secret the grant should have covered). The id-form bindings that the
# first version of this script wrote are removed below.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
COND='expression=resource.name.startsWith("projects/'"$PROJECT_NUMBER"'/secrets/amazon-refresh-"),title=amazon-refresh-only'
DEAD_COND='expression=resource.name.startsWith("projects/'"$PROJECT"'/secrets/amazon-refresh-"),title=amazon-refresh-only'
project_bind() {
  gcloud projects remove-iam-policy-binding "$PROJECT" --member="$1" --role="$2" --condition="$DEAD_COND" --quiet >/dev/null 2>&1 || true
  gcloud projects add-iam-policy-binding "$PROJECT" --member="$1" --role="$2" --condition="$COND" --quiet >/dev/null; echo "  amazon-refresh-* ← $2 → ${1#serviceAccount:}"
}
project_bind "$OAUTH" roles/secretmanager.secretVersionAdder
project_bind "$SYNC"  roles/secretmanager.secretAccessor
# Disconnect deletes the connection's refresh-token secret (connections.js:
# deleteSecret) and does nothing else to Secret Manager, so admin gets one
# permission — not roles/secretmanager.admin, which the first version of this
# script granted (condition-scoped, but still setIamPolicy/versions/etc.).
if ! gcloud iam roles describe amazonRefreshTokenRemover --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles create amazonRefreshTokenRemover --project="$PROJECT" --title="Amazon refresh-token secret remover" \
    --permissions=secretmanager.secrets.delete --stage=GA >/dev/null
fi
gcloud projects remove-iam-policy-binding "$PROJECT" --member="$ADMIN" --role=roles/secretmanager.admin --condition="$DEAD_COND" --quiet >/dev/null 2>&1 || true
gcloud projects remove-iam-policy-binding "$PROJECT" --member="$ADMIN" --role=roles/secretmanager.admin --condition="$COND" --quiet >/dev/null 2>&1 || true
project_bind "$ADMIN" "projects/$PROJECT/roles/amazonRefreshTokenRemover"
# Creating the secret itself (oauth, at consent) needs secretmanager.secrets.create on the
# project, which no condition can scope by name because the resource does not exist yet.
# roles/secretmanager.admin is too wide for that; a custom role with only secrets.create:
if ! gcloud iam roles describe amazonSecretCreator --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles create amazonSecretCreator --project="$PROJECT" --title="Amazon refresh-token secret creator" \
    --permissions=secretmanager.secrets.create --stage=GA >/dev/null
fi
gcloud projects add-iam-policy-binding "$PROJECT" --member="$OAUTH" --role="projects/$PROJECT/roles/amazonSecretCreator" --condition=None --quiet >/dev/null
echo "  secrets.create ← amazonSecretCreator (custom, one permission) → amazon-oauth"
