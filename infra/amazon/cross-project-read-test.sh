#!/usr/bin/env bash
# The segmentation proof for the perimeter: an identity from the main
# project (amazon-caller@eggcraft-studio) tries to READ the Amazon project's
# Firestore over the public API. Before enforcement IAM refuses it
# (PERMISSION_DENIED — the account holds no role there) and the perimeter
# logs a dry-run violation; after enforcement the refusal comes from VPC
# Service Controls itself (VPC_SERVICE_CONTROLS in the status). Both are
# recorded; the second is the one Amazon's control 1 asks for.
#
# The attempt runs as a one-off Cloud Run job in the MAIN project (the only
# place that identity can run), deleted afterwards. Read-only by construction:
# a GET that is refused.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
AMAZON="${AMAZON_PROJECT_ID:-nivadesk-amazon}"; MAIN="eggcraft-studio"; REGION="europe-west2"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/security/evidence/amazon/cross-project-read-$(date -u +%Y-%m-%d).txt"
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SCRIPT='M=http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
T=$(curl -s -H "Metadata-Flavor: Google" "$M" | sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p")
c=$(curl -s -o /tmp/b -w "%{http_code}" -m 20 -H "Authorization: Bearer $T" "https://firestore.googleapis.com/v1/projects/AMAZON/databases/(default)/documents/connections?pageSize=1")
echo "xproj firestore read as $(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email): status=$c reason=$(tr -d "\n" < /tmp/b | sed -n "s/.*\"status\": *\"\([A-Z_]*\)\".*/\1/p") detail=$(tr -d "\n" < /tmp/b | grep -o "VPC_SERVICE_CONTROLS\|vpcServiceControlsUniqueIdentifier" | head -1)"'
SCRIPT=${SCRIPT//AMAZON/$AMAZON}
B64=$(printf '%s' "$SCRIPT" | base64 | tr -d '\n')
gcloud run jobs delete amazon-xproj-read --region="$REGION" --project="$MAIN" --quiet >/dev/null 2>&1 || true
gcloud run jobs create amazon-xproj-read --region="$REGION" --project="$MAIN" --image=gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  --command=bash --args="-c,eval \"\$(echo $B64 | base64 -d)\"" --service-account="amazon-caller@$MAIN.iam.gserviceaccount.com" \
  --max-retries=0 --task-timeout=120s >/dev/null 2>&1 || { echo "could not create the job"; exit 2; }
out=$(mktemp); gcloud run jobs execute amazon-xproj-read --region="$REGION" --project="$MAIN" --wait >"$out" 2>&1; EXEC=$(grep -o 'amazon-xproj-read-[a-z0-9]*' "$out" | head -1); rm -f "$out"
sleep 25
{
  echo "# $STAMP — cross-project read attempt: amazon-caller@$MAIN → Firestore of $AMAZON (Cloud Run job amazon-xproj-read, execution $EXEC)"
  gcloud logging read "resource.type=\"cloud_run_job\" AND labels.\"run.googleapis.com/execution_name\"=\"$EXEC\" AND textPayload:\"xproj\"" --project="$MAIN" --freshness=10m --limit=2 --format='value(textPayload)'
  echo "== what the perimeter recorded for it (dry-run entries are 'would have been refused'; enforced entries are refusals)"
  gcloud logging read 'protoPayload.metadata.@type="type.googleapis.com/google.cloud.audit.VpcServiceControlAuditMetadata" AND protoPayload.serviceName="firestore.googleapis.com"' \
    --project="$AMAZON" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=15m --limit=3 \
    --format='value(timestamp,protoPayload.metadata.dryRun,protoPayload.authenticationInfo.principalEmail,protoPayload.methodName,protoPayload.metadata.violationReason)'
} | tee "$OUT"
gcloud run jobs delete amazon-xproj-read --region="$REGION" --project="$MAIN" --quiet >/dev/null 2>&1 && echo "job deleted"
echo "record: $OUT"
