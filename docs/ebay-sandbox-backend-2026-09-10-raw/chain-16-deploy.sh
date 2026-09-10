#!/bin/zsh
set -u
cd /Users/gocmen/Developer/studioflow-app || exit 1
stamp() { date -u +%FT%TZ; }
NAMES=(beginEbayConnect claimEbayConnectState disconnectEbay ebayNotifications ebayOAuthCallback getEbayConnections previewEbayImport reconcileEbayConnections reconcileEbayConnectionsNightly reconcileEbayDeletions retryEbayImportFailures revealRestrictedCustomer runEbayImport syncEbayNow updateEbayConnectionSettings verifyEbayConnection)
echo "=== $(stamp) pre-checks"; echo "  names: ${#NAMES[@]}"
gcloud auth print-access-token >/dev/null 2>&1 && echo "  gcloud token: ok" || { echo "STOP: gcloud token invalid"; exit 1; }
git merge-base --is-ancestor 76c5e3c3 HEAD && echo "  ancestor 76c5e3c3: ok" || { echo "STOP: no Stripe fix"; exit 1; }
[ -z "$(git status --porcelain | grep -v '^??')" ] && echo "  tree clean: ok" || { echo "STOP: dirty tree"; exit 1; }
[ -f functions/.env ] && echo "  functions/.env: present" || exit 1
[ -f functions/.ebay-secrets-ready ] && echo "  marker: present" || { echo "STOP: marker missing"; exit 1; }
[ "$(grep -c '^NIVADESK_EBAY_CONNECTOR=' functions/.env)" = "0" ] && echo "  connector flag: unset (off)" || { echo "STOP: connector flag set"; exit 1; }
grep -q '^NIVADESK_EBAY_ENVIRONMENT=sandbox$' functions/.env && grep -q '^NIVADESK_EBAY_RUNAME=EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi$' functions/.env && echo "  sandbox env + RuName: ok" || { echo "STOP: env"; exit 1; }
[ "$(git rev-parse HEAD:functions)" = "$(git rev-parse origin/macbook-save-before-macstudio-2026-06-01:functions)" ] && echo "  functions/ == origin deploy tip: ok" || { echo "STOP: functions differs from origin"; exit 1; }
echo "  HEAD: $(git rev-parse --short HEAD)"
ONLY=$(printf 'functions:%s,' "${NAMES[@]}"); ONLY=${ONLY%,}
echo "=== $(stamp) deploy 16 by name (worker NOT included)"; echo "  --only $ONLY"
npx firebase deploy --project eggcraft-studio --only "$ONLY" --non-interactive 2>&1 | grep -v '^$'
echo "deploy exit ${pipestatus[1]} at $(stamp)"
echo "=== $(stamp) quick read-back"
for n in "${NAMES[@]}"; do s=$(echo "$n" | tr '[:upper:]' '[:lower:]'); gcloud run services describe "$s" --region=europe-west2 --project=eggcraft-studio --format='value(status.traffic[0].revisionName,status.conditions[0].status,spec.template.spec.serviceAccountName)' 2>&1 | tail -1 | sed "s/^/  $n: /"; done
echo "=== $(stamp) chain done"
