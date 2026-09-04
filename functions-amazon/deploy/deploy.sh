#!/usr/bin/env bash
# Builds the image inside the Amazon project and deploys the three services
# from their specs. Step 4 of the design's sequence — runs only after the
# project exists (step 3, a sign-off gate). Idempotent.
#
# Requires the operator to be authenticated; deploys impersonate
# amazon-deploy@ so that no human identity holds run.admin day to day.
set -euo pipefail

PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
TAG="${IMAGE_TAG:-$(git -C "$(dirname "$0")/../.." rev-parse --short HEAD 2>/dev/null || date +%s)}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/amazon/nivadesk-amazon:$TAG"
DEPLOY_SA="amazon-deploy@$PROJECT.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"

# Values that are not secrets but are per-application, read from the
# environment so they are not committed either.
: "${SP_API_APPLICATION_ID:?set SP_API_APPLICATION_ID (from Seller Central → Develop Apps)}"
: "${LWA_CLIENT_ID:?set LWA_CLIENT_ID (the LWA client id; the secret goes into Secret Manager by hand)}"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
echo "project=$PROJECT ($PROJECT_NUMBER) image=$IMAGE"

echo "══ 1. Build (Cloud Build, inside the project) ══"
gcloud builds submit "$SRC" --project="$PROJECT" --region="$REGION" \
  --tag="$IMAGE" --impersonate-service-account="$DEPLOY_SA" \
  --ignore-file="$HERE/.gcloudignore" >/dev/null
echo "  built"

echo "══ 2. Firestore rules: deny all ══"
gcloud firestore databases update --project="$PROJECT" --database='(default)' >/dev/null 2>&1 || true
firebase deploy --only firestore:rules --project="$PROJECT" --config "$HERE/firebase.json" --non-interactive >/dev/null
echo "  rules released"

echo "══ 3. Services ══"
for role in oauth admin sync; do
  spec=$(mktemp)
  sed -e "s|PROJECT_ID|$PROJECT|g" -e "s|PROJECT_NUMBER|$PROJECT_NUMBER|g" -e "s|IMAGE|$IMAGE|g" \
      -e "s|\"SP_API_APPLICATION_ID\"|\"$SP_API_APPLICATION_ID\"|g" -e "s|\"LWA_CLIENT_ID\"|\"$LWA_CLIENT_ID\"|g" \
      "$HERE/service-$role.yaml" > "$spec"
  gcloud run services replace "$spec" --project="$PROJECT" --region="$REGION" \
    --impersonate-service-account="$DEPLOY_SA" >/dev/null
  rm -f "$spec"
  url=$(gcloud run services describe "amazon-$role" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
  ingress=$(gcloud run services describe "amazon-$role" --project="$PROJECT" --region="$REGION" --format='value(metadata.annotations."run.googleapis.com/ingress")')
  echo "  amazon-$role  $url  ingress=$ingress"
done

echo "══ 4. Proof: the run.app addresses answer 403 to the world ══"
for role in oauth admin sync; do
  url=$(gcloud run services describe "amazon-$role" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$url/healthz" || echo "000")
  echo "  $url/healthz → $code $([ "$code" = "403" ] || [ "$code" = "404" ] && echo "✓ unreachable" || echo "❌ REACHABLE")"
done

echo "══ done. Next: deploy/secrets.sh (secret IAM), deploy/scheduler.sh (the sync tick), infra/amazon/create-edge.sh (LB + Armor; DNS is a gate) ══"
