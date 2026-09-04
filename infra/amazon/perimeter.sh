#!/usr/bin/env bash
# The VPC Service Controls perimeter around the Amazon project. Steps 7–8 of
# the design: DRY-RUN first, a week of real traffic, the violation report
# shown, then — ⛔ gate — enforcement.
#
#   perimeter.sh dry-run     create the access policy (once) and the perimeter
#                            in dry-run mode with its ingress and egress rules
#   perimeter.sh report      violations recorded under dry-run, for the gate
#   perimeter.sh enforce     ⛔ promote the dry-run configuration to enforced
#
# Requires Access Context Manager Admin on the organisation.
set -euo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
ORG_ID="378239481010"
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
MAIN_PROJECT_NUMBER="477037475099"
OPERATOR="${OPERATOR_EMAIL:-contact@eggcraft.co.uk}"
DRY_RUN="${DRY_RUN:-1}"
MODE="${1:-dry-run}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created or changed."

PROJECT_NUMBER=$( [ "$DRY_RUN" = "1" ] && echo "<number>" || gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RESTRICTED="firestore.googleapis.com,secretmanager.googleapis.com,run.googleapis.com,cloudscheduler.googleapis.com,logging.googleapis.com,monitoring.googleapis.com,artifactregistry.googleapis.com,cloudbuild.googleapis.com,storage.googleapis.com,pubsub.googleapis.com"

HERE="$(cd "$(dirname "$0")" && pwd)"
INGRESS="$HERE/perimeter-ingress.yaml"
EGRESS="$HERE/perimeter-egress.yaml"
# Rule files are rendered with the real numbers and the operator identity.
render() { sed -e "s|PROJECT_NUMBER|$PROJECT_NUMBER|g" -e "s|MAIN_PROJECT_NUMBER|$MAIN_PROJECT_NUMBER|g" -e "s|OPERATOR_EMAIL|$OPERATOR|g" -e "s|PROJECT_ID|$PROJECT|g" "$1"; }

case "$MODE" in
  dry-run)
    echo "══ 1. API ══"
    run gcloud services enable accesscontextmanager.googleapis.com --project="$PROJECT"
    echo "══ 2. Organisation access policy (created once; reused if present) ══"
    POLICY=$( [ "$DRY_RUN" = "1" ] && echo "<policy>" || gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' | head -1)
    if [ -z "$POLICY" ] || [ "$POLICY" = "<policy>" ]; then
      run gcloud access-context-manager policies create --organization="$ORG_ID" --title="eggcraft-access-policy"
      POLICY="<policy>"
    fi
    echo "  policy: $POLICY"
    echo "══ 3. Perimeter amazon-information, DRY-RUN configuration ══"
    I=$(mktemp); E=$(mktemp); render "$INGRESS" > "$I"; render "$EGRESS" > "$E"
    run gcloud access-context-manager perimeters dry-run create amazon-information --policy="$POLICY" \
        --title="Amazon Information" --perimeter-type=regular \
        --resources="projects/$PROJECT_NUMBER" --restricted-services="$RESTRICTED" \
        --ingress-policies="$I" --egress-policies="$E"
    rm -f "$I" "$E"
    echo "  Now: a week of real traffic. Violations appear in Cloud Logging as"
    echo "  protoPayload.metadata.dryRun=true with VPC_SERVICE_CONTROLS in the status. Then: perimeter.sh report"
    ;;
  report)
    echo "══ Dry-run violations, last 7 days ══"
    gcloud logging read \
      'protoPayload.metadata.@type="type.googleapis.com/google.cloud.audit.VpcServiceControlAuditMetadata" AND protoPayload.metadata.dryRun=true' \
      --project="$PROJECT" --freshness=7d --limit=500 \
      --format='table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.serviceName,protoPayload.methodName,protoPayload.metadata.violationReason)' \
      | tee "$HERE/../../docs/security/evidence/amazon/vpcsc-dryrun-report.txt" 2>/dev/null || true
    echo "  Each row is either resolved (a rule added) or explained, in the report shown at the gate."
    ;;
  enforce)
    echo "══ ⛔ Enforce: promotes the dry-run config to enforced ══"
    POLICY=$( [ "$DRY_RUN" = "1" ] && echo "<policy>" || gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' | head -1)
    run gcloud access-context-manager perimeters dry-run enforce amazon-information --policy="$POLICY"
    echo "  Proof for the evidence pack: a Firestore read of the Amazon project from the main project's identity must now fail with VPC_SERVICE_CONTROLS."
    ;;
  *) echo "usage: perimeter.sh dry-run|report|enforce"; exit 2 ;;
esac
echo "══ done ($MODE) ══"
