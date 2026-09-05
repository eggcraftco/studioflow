#!/usr/bin/env bash
# The diagnostic job: ROLE=diag on the same image, as a Cloud Run JOB (no
# ingress, no service, runs once and exits). From inside amazon-vpc it
# resolves the Google API hostnames and reports which addresses answered;
# it exits non-zero if any is outside the restricted VIP 199.36.153.4/30.
#
# This is the proof that Firestore, Secret Manager and Logging traffic does
# not depend on public Google API resolution — run once BEFORE
# infra/amazon/private-google-access.sh (it must FAIL: that shows the check
# can fail) and once after (it must pass), before the perimeter is enforced.
# Its log lines go into the evidence pack.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_SA="amazon-deploy@$PROJECT.iam.gserviceaccount.com"
# The image: the one amazon-sync runs, or — before any service exists — a fresh build.
IMAGE="${IMAGE:-$(gcloud run services describe amazon-sync --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true)}"
[ -n "$IMAGE" ] || IMAGE=$("$HERE/build.sh")
echo "image: $IMAGE"

verb=create
gcloud run jobs describe amazon-diag --project="$PROJECT" --region="$REGION" >/dev/null 2>&1 && verb=update
gcloud run jobs "$verb" amazon-diag --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
  --set-env-vars=ROLE=diag --network=amazon-vpc --subnet=amazon-subnet --vpc-egress=all-traffic \
  --service-account="amazon-sync@$PROJECT.iam.gserviceaccount.com" --max-retries=0 --task-timeout=120s \
  --impersonate-service-account="$DEPLOY_SA" >/dev/null || { echo "could not $verb the job"; exit 2; }

echo "running amazon-diag…"
out=$(mktemp)
if gcloud run jobs execute amazon-diag --project="$PROJECT" --region="$REGION" --wait >"$out" 2>&1; then RESULT="OK"; else RESULT="FAIL"; fi
EXEC=$(grep -o 'amazon-diag-[a-z0-9]*' "$out" | head -1)
rm -f "$out"
echo "execution: ${EXEC:-?} → $RESULT"
# The project's _Default sink is disabled by design; application logs live only
# in the amazon-audit bucket, so the read names that bucket's view.
sleep 15
gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"amazon-diag\" AND labels.\"run.googleapis.com/execution_name\"=\"$EXEC\" AND textPayload:\"diag \"" \
  --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs \
  --freshness=15m --limit=20 --format='value(textPayload)' | sort
echo "amazon-diag: $RESULT"
[ "$RESULT" = "OK" ]
