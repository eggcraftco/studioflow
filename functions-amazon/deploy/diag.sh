#!/usr/bin/env bash
# The diagnostic job: ROLE=diag on the same image, as a Cloud Run JOB (no
# ingress, no service, runs once and exits). From inside amazon-vpc it
# resolves the Google API hostnames and reports which addresses answered;
# it exits non-zero if any is outside the restricted VIP 199.36.153.4/30.
#
# This is the proof that Firestore, Secret Manager and Logging traffic does
# not depend on public Google API resolution — run after
# infra/amazon/private-google-access.sh and before the perimeter is enforced.
# Its log lines go into the evidence pack.
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
DEPLOY_SA="amazon-deploy@$PROJECT.iam.gserviceaccount.com"
IMAGE="${IMAGE:-$(gcloud run services describe amazon-sync --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.containers[0].image)')}"

if gcloud run jobs describe amazon-diag --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  gcloud run jobs update amazon-diag --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
    --set-env-vars=ROLE=diag --network=amazon-vpc --subnet=amazon-subnet --vpc-egress=all-traffic \
    --service-account="amazon-sync@$PROJECT.iam.gserviceaccount.com" --max-retries=0 --task-timeout=120s \
    --impersonate-service-account="$DEPLOY_SA" >/dev/null
else
  gcloud run jobs create amazon-diag --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
    --set-env-vars=ROLE=diag --network=amazon-vpc --subnet=amazon-subnet --vpc-egress=all-traffic \
    --service-account="amazon-sync@$PROJECT.iam.gserviceaccount.com" --max-retries=0 --task-timeout=120s \
    --impersonate-service-account="$DEPLOY_SA" >/dev/null
fi
echo "running amazon-diag…"
if gcloud run jobs execute amazon-diag --project="$PROJECT" --region="$REGION" --wait >/dev/null 2>&1; then RESULT="OK"; else RESULT="FAIL"; fi
sleep 10
gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"amazon-diag\" AND textPayload:\"diag \"" \
  --project="$PROJECT" --freshness=10m --limit=20 --format='value(textPayload)' | sort
echo "amazon-diag: $RESULT"
[ "$RESULT" = "OK" ]
