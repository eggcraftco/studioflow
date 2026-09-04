#!/usr/bin/env bash
# The sync tick: Cloud Scheduler → amazon-sync /run, every 30 minutes, with an
# OIDC token minted for amazon-sync@ and the service's own URL as audience.
# The service verifies exactly that identity and audience (config: SYNC_*).
set -euo pipefail
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
SA="amazon-sync@$PROJECT.iam.gserviceaccount.com"
URL=$(gcloud run services describe amazon-sync --project="$PROJECT" --region="$REGION" --format='value(status.url)')

# The scheduler must be allowed to invoke the service as amazon-sync@ …
gcloud run services add-iam-policy-binding amazon-sync --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:$SA" --role=roles/run.invoker --quiet >/dev/null
# … and the scheduler's own agent must be allowed to mint tokens for amazon-sync@.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null

if gcloud scheduler jobs describe amazon-sync-tick --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http amazon-sync-tick --project="$PROJECT" --location="$REGION" \
    --schedule="*/30 * * * *" --time-zone="Europe/London" --uri="$URL/run" --http-method=POST \
    --oidc-service-account-email="$SA" --oidc-token-audience="$URL" --attempt-deadline=900s >/dev/null
else
  gcloud scheduler jobs create http amazon-sync-tick --project="$PROJECT" --location="$REGION" \
    --schedule="*/30 * * * *" --time-zone="Europe/London" --uri="$URL/run" --http-method=POST \
    --oidc-service-account-email="$SA" --oidc-token-audience="$URL" --attempt-deadline=900s >/dev/null
fi
echo "amazon-sync-tick → $URL/run every 30 minutes as $SA"
