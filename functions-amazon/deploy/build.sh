#!/usr/bin/env bash
# Builds the image inside the Amazon project with Cloud Build (europe-west2)
# and prints its reference as the last line. Used by deploy.sh and, before any
# service exists, by diag.sh.
#
# Why it looks the way it does:
#  - source staging: the bucket gcloud would create by default is US
#    multi-region, which the project's gcp.resourceLocations policy refuses,
#    so the source goes to a regional bucket created here once;
#  - logging: CLOUD_LOGGING_ONLY (cloudbuild.yaml) for the same reason — no
#    GCS logs bucket at all;
#  - builder identity: amazon-deploy@ (user-managed). The compute default
#    account is the project's default builder but holds no role here (org
#    policy), and Cloud Build refuses the Google-managed legacy build account
#    as an explicit choice. amazon-deploy@ therefore also holds
#    logging.logWriter (build logs) and objectViewer on the staging bucket;
#  - the operator submits the build directly rather than impersonating
#    amazon-deploy@: uploading the source would need bucket grants for that
#    account that buy nothing. Service deploys (deploy.sh) still go through it.
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"
TAG="${IMAGE_TAG:-$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || date +%s)}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/amazon/nivadesk-amazon:$TAG"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
STAGING="gs://$PROJECT-build-src"

if ! gcloud storage buckets describe "$STAGING" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "$STAGING" --project="$PROJECT" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention >&2
  lifecycle=$(mktemp); echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7}}]}' > "$lifecycle"
  gcloud storage buckets update "$STAGING" --project="$PROJECT" --lifecycle-file="$lifecycle" >&2
  rm -f "$lifecycle"
fi
# The builder reads the staged source from this bucket and nothing else in Storage.
if ! gcloud storage buckets get-iam-policy "$STAGING" --project="$PROJECT" --format=json 2>/dev/null \
     | grep -q "amazon-deploy@$PROJECT.iam.gserviceaccount.com"; then
  gcloud storage buckets add-iam-policy-binding "$STAGING" --project="$PROJECT" \
    --member="serviceAccount:amazon-deploy@$PROJECT.iam.gserviceaccount.com" --role=roles/storage.objectViewer >/dev/null
fi
loc=$(gcloud storage buckets describe "$STAGING" --project="$PROJECT" --format='value(location)')
[ "$loc" = "EUROPE-WEST2" ] || { echo "staging bucket is in $loc, not europe-west2" >&2; exit 1; }

echo "building $IMAGE (source: $SRC, staging: $STAGING)" >&2
gcloud builds submit "$SRC" --project="$PROJECT" --region="$REGION" \
  --config="$HERE/cloudbuild.yaml" --substitutions="_IMAGE=$IMAGE" \
  --service-account="projects/$PROJECT/serviceAccounts/amazon-deploy@$PROJECT.iam.gserviceaccount.com" \
  --gcs-source-staging-dir="$STAGING/source" \
  --ignore-file="$HERE/.gcloudignore" >&2
# The image must be in the project's registry, in the region, or nothing was proven.
gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" --format='value(image_summary.digest)' >&2
echo "$IMAGE"
