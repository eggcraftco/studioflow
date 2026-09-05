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
# Organisation-level Access Context Manager calls are quota-attributed to
# gcloud's core project; make that the Amazon project (where step 1 enables
# the API) rather than whatever the shell defaults to.
export CLOUDSDK_CORE_PROJECT="$PROJECT"
MAIN_PROJECT_NUMBER="477037475099"
OPERATOR="${OPERATOR_EMAIL:-contact@eggcraft.co.uk}"
DRY_RUN="${DRY_RUN:-1}"
MODE="${1:-dry-run}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created or changed."

PROJECT_NUMBER=$( [ "$DRY_RUN" = "1" ] && echo "<number>" || gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RESTRICTED="firestore.googleapis.com,secretmanager.googleapis.com,run.googleapis.com,cloudscheduler.googleapis.com,logging.googleapis.com,monitoring.googleapis.com,artifactregistry.googleapis.com,cloudbuild.googleapis.com,storage.googleapis.com,pubsub.googleapis.com"

HERE="$(cd "$(dirname "$0")" && pwd)"
INGRESS="$HERE/perimeter-ingress.yaml"
EGRESS="$HERE/perimeter-egress.yaml"
# Perimeter short names allow letters, digits and underscores only (the API
# refuses a hyphen with "Invalid perimeter name").
# Rule files are rendered with the real numbers and the operator identity.
# MAIN_PROJECT_NUMBER must be replaced before PROJECT_NUMBER, which is its suffix.
render() { sed -e "s|MAIN_PROJECT_NUMBER|$MAIN_PROJECT_NUMBER|g" -e "s|PROJECT_NUMBER|$PROJECT_NUMBER|g" -e "s|OPERATOR_EMAIL|$OPERATOR|g" -e "s|PROJECT_ID|$PROJECT|g" "$1"; }

case "$MODE" in
  dry-run)
    echo "══ 1. API ══"
    run gcloud services enable accesscontextmanager.googleapis.com --project="$PROJECT"
    echo "══ 2. Organisation access policy (created once; reused if present) ══"
    POLICY=$( [ "$DRY_RUN" = "1" ] && echo "<policy>" || gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' | head -1)
    if [ -z "$POLICY" ] || [ "$POLICY" = "<policy>" ]; then
      run gcloud access-context-manager policies create --organization="$ORG_ID" --title="eggcraft-access-policy"
      POLICY=$( [ "$DRY_RUN" = "1" ] && echo "<policy>" || gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' | head -1)
    fi
    echo "  policy: $POLICY"
    echo "══ 3. Perimeter amazon_information, DRY-RUN configuration ══"
    I=$(mktemp); E=$(mktemp); render "$INGRESS" > "$I"; render "$EGRESS" > "$E"
    # The dry-run subcommand prefixes every perimeter flag with --perimeter-.
    if exists gcloud access-context-manager perimeters describe amazon_information --policy="$POLICY"; then
      echo "  perimeter amazon_information exists — updating its dry-run configuration"
      run gcloud access-context-manager perimeters dry-run update "accessPolicies/$POLICY/servicePerimeters/amazon_information" \
          --set-resources="projects/$PROJECT_NUMBER" --set-restricted-services="$RESTRICTED" \
          --set-ingress-policies="$I" --set-egress-policies="$E"
    else
      run gcloud access-context-manager perimeters dry-run create "accessPolicies/$POLICY/servicePerimeters/amazon_information" \
          --perimeter-title="Amazon Information" --perimeter-type=regular \
          --perimeter-resources="projects/$PROJECT_NUMBER" --perimeter-restricted-services="$RESTRICTED" \
          --perimeter-ingress-policies="$I" --perimeter-egress-policies="$E"
    fi
    rm -f "$I" "$E"
    echo "  Now: a week of real traffic. Violations appear in Cloud Logging as"
    echo "  protoPayload.metadata.dryRun=true with VPC_SERVICE_CONTROLS in the status. Then: perimeter.sh report"
    ;;
  report)
    # The project's _Default sink is disabled by design: the read names the amazon-audit bucket view.
    echo "══ Dry-run violations, last 7 days ══"
    gcloud logging read \
      'protoPayload.metadata.@type="type.googleapis.com/google.cloud.audit.VpcServiceControlAuditMetadata" AND protoPayload.metadata.dryRun=true' \
      --project="$PROJECT" --bucket=amazon-audit --location=europe-west2 --view=_AllLogs --freshness=7d --limit=500 \
      --format='table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.serviceName,protoPayload.methodName,protoPayload.metadata.violationReason)' \
      | tee "$HERE/../../docs/security/evidence/amazon/vpcsc-dryrun-report.txt" 2>/dev/null || true
    echo "  Each row is either resolved (a rule added) or explained, in the report shown at the gate."
    ;;
  enforce)
    echo "══ ⛔ Enforce: promotes the dry-run config to enforced ══"
    POLICY=$( [ "$DRY_RUN" = "1" ] && echo "<policy>" || gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' | head -1)
    run gcloud access-context-manager perimeters dry-run enforce amazon_information --policy="$POLICY"
    echo "  Proof for the evidence pack: a Firestore read of the Amazon project from the main project's identity must now fail with VPC_SERVICE_CONTROLS."
    ;;
  *) echo "usage: perimeter.sh dry-run|report|enforce"; exit 2 ;;
esac
echo "══ done ($MODE) ══"
