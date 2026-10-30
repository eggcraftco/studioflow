#!/usr/bin/env bash
# nivadesk.app on Cloud Run (europe-west2): build the image and deploy the service `nivadesk-web`.
#
#   ACTION=plan   (default) read what exists, print what would change, change nothing
#   ACTION=apply  build in Cloud Build, deploy, read back
#
# The service answers only through the load balancer (ingress internal-and-cloud-load-balancing; the
# run.app address is closed to the internet). Invoker IAM is disabled instead of granting allUsers,
# which the organisation's domain-restricted sharing refuses — the same pattern as amazon-oauth.
#
# NEXT_PUBLIC_* come from ENV_FILE (default ./.env.production.local, gitignored): copy the nine
# NEXT_PUBLIC_* lines from hPanel → nivadesk.app → Ortam değişkenleri. The one server secret,
# NIVADESK_EBAY_CALLBACK_KEY, is bound from Secret Manager (EBAY_CALLBACK_KEY) and never read here.
set -euo pipefail
PROJECT="${PROJECT:-eggcraft-studio}"
REGION=europe-west2
SERVICE=nivadesk-web
SA="nivadesk-web@${PROJECT}.iam.gserviceaccount.com"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.production.local}"
ACTION="${ACTION:-plan}"
# How many proxies append to x-forwarded-for in front of the app (lib/studioflow/ebayAdmission.ts).
# Google's load balancer writes "<client>, <lb>"; confirm with smoke.sh's hop check and redeploy if not 2.
TRUSTED_HOPS="${NIVADESK_TRUSTED_PROXY_HOPS:-2}"

GIT_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD)
TAG=$(git -C "$REPO_ROOT" rev-parse --short=9 HEAD)
[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ] || { echo "refusing: uncommitted changes (the image must be one commit)"; exit 1; }
IMAGE="$REGION-docker.pkg.dev/$PROJECT/web/nivadesk-web:$TAG"

echo "══ project $PROJECT · service $SERVICE · image $IMAGE · action $ACTION"
gcloud artifacts repositories describe web --location="$REGION" --project="$PROJECT" >/dev/null 2>&1 \
  && echo "artifact repo 'web': present" || echo "artifact repo 'web': MISSING (apply creates it)"
gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1 \
  && echo "service account: present" || echo "service account: MISSING (apply creates it, no roles)"
gcloud secrets describe EBAY_CALLBACK_KEY --project="$PROJECT" >/dev/null 2>&1 \
  && echo "secret EBAY_CALLBACK_KEY: present (name only)" || { echo "secret EBAY_CALLBACK_KEY: MISSING"; exit 1; }
gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)' 2>/dev/null \
  || echo "service $SERVICE: not deployed yet"

[ "$ACTION" = "apply" ] || { echo "plan only — nothing changed"; exit 0; }

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (the NEXT_PUBLIC_* lines)"; exit 1; }
subs="_IMAGE=$IMAGE,_GIT_COMMIT=$GIT_COMMIT,_NV_BUILD_ID=$(date -u +%Y%m%d%H%M)"
for name in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID \
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID NEXT_PUBLIC_FIREBASE_VAPID_KEY NEXT_PUBLIC_STAGING_NO_INDEX; do
  value=$(grep -E "^${name}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
  [ -n "$value" ] || [ "$name" = "NEXT_PUBLIC_STAGING_NO_INDEX" ] || { echo "missing $name in $ENV_FILE"; exit 1; }
  subs="$subs,_${name}=${value}"
done

gcloud artifacts repositories describe web --location="$REGION" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud artifacts repositories create web --repository-format=docker --location="$REGION" --project="$PROJECT"
gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create nivadesk-web --display-name="nivadesk.app web (no roles)" --project="$PROJECT"
# The runtime identity may read exactly one secret.
gcloud secrets add-iam-policy-binding EBAY_CALLBACK_KEY --project="$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null

gcloud builds submit "$REPO_ROOT" --project="$PROJECT" --region="$REGION" \
  --config="$REPO_ROOT/infra/cloudrun/cloudbuild.yaml" --substitutions="$subs"

gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
  --service-account="$SA" --ingress=internal-and-cloud-load-balancing --no-invoker-iam-check \
  --min-instances=1 --max-instances=10 --cpu=1 --memory=1Gi --concurrency=80 --timeout=60 \
  --execution-environment=gen2 --port=8080 \
  --set-env-vars="NIVADESK_TRUSTED_PROXY_HOPS=$TRUSTED_HOPS" \
  --set-secrets="NIVADESK_EBAY_CALLBACK_KEY=EBAY_CALLBACK_KEY:latest"

echo "══ readback"
gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image,status.traffic[0].percent)'
url=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)')
code=$(curl -s -o /dev/null -w '%{http_code}' "$url/" || true)
echo "$url → $code (expected 404/403: closed to the internet, only the load balancer may reach it)"
