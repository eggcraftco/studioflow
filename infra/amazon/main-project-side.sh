#!/usr/bin/env bash
# The main project's half of the bridge — eggcraft-studio, not the Amazon
# project. Creates the one identity that may call the Amazon zone's admin
# surface, the secret the connect intent is signed with, and — once the Amazon
# project exists — lets amazon-sync@ invoke ingestAmazonEnvelope.
#
# Runs against the MAIN project. Safe to run early for steps 1–2; step 3 needs
# both projects and the deployed function. DRY_RUN=1 by default.
set -euo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
MAIN="eggcraft-studio"
AMAZON="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
CALLER="amazon-caller"
DRY_RUN="${DRY_RUN:-1}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created."

echo "══ 1. amazon-caller@ in the main project ══"
exists gcloud iam service-accounts describe "$CALLER@$MAIN.iam.gserviceaccount.com" --project="$MAIN" \
  || run gcloud iam service-accounts create "$CALLER" --project="$MAIN" --display-name="Calls the Amazon zone's admin surface; mints connect intents"
# amazonConnectStart and amazonStatus run AS this account (functions option serviceAccount),
# so it needs what those two functions need and nothing else.
run gcloud projects add-iam-policy-binding "$MAIN" --member="serviceAccount:$CALLER@$MAIN.iam.gserviceaccount.com" --role=roles/datastore.user --condition=None --quiet
run gcloud projects add-iam-policy-binding "$MAIN" --member="serviceAccount:$CALLER@$MAIN.iam.gserviceaccount.com" --role=roles/logging.logWriter --condition=None --quiet
# The Functions deploy has to be allowed to attach this account to a function.
run gcloud iam service-accounts add-iam-policy-binding "$CALLER@$MAIN.iam.gserviceaccount.com" --project="$MAIN" \
  --member="serviceAccount:477037475099-compute@developer.gserviceaccount.com" --role=roles/iam.serviceAccountUser --quiet

echo "══ 2. The intent signing key, in the main project's Secret Manager (created EMPTY) ══"
exists gcloud secrets describe AMAZON_INTENT_HMAC_KEY --project="$MAIN" \
  || run gcloud secrets create AMAZON_INTENT_HMAC_KEY --project="$MAIN" --replication-policy=user-managed --locations="$REGION"
run gcloud secrets add-iam-policy-binding AMAZON_INTENT_HMAC_KEY --project="$MAIN" \
  --member="serviceAccount:$CALLER@$MAIN.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor --quiet
cat <<'EOF'
  ⚠  The SAME hex value goes into eggcraft-studio/AMAZON_INTENT_HMAC_KEY and nivadesk-amazon/intent-hmac-key.
     Generate once (openssl rand -hex 32) and paste into both consoles. Never through chat.
EOF

echo "══ 3. Let amazon-sync@ (Amazon project) invoke ingestAmazonEnvelope (after both exist) ══"
if exists gcloud functions describe ingestAmazonEnvelope --region="$REGION" --project="$MAIN" --gen2; then
  run gcloud functions add-invoker-policy-binding ingestAmazonEnvelope --region="$REGION" --project="$MAIN" \
    --member="serviceAccount:amazon-sync@$AMAZON.iam.gserviceaccount.com"
else
  echo "  ingestAmazonEnvelope is not deployed yet — deploy it by name first, then re-run this step."
fi

echo "══ 4. Let amazon-caller@ invoke amazon-admin (Amazon project) ══"
if exists gcloud run services describe amazon-admin --region="$REGION" --project="$AMAZON"; then
  run gcloud run services add-iam-policy-binding amazon-admin --region="$REGION" --project="$AMAZON" \
    --member="serviceAccount:$CALLER@$MAIN.iam.gserviceaccount.com" --role=roles/run.invoker --quiet
else
  echo "  amazon-admin does not exist yet — run functions-amazon/deploy/deploy.sh first, then re-run this step."
fi
echo "══ done ══"
