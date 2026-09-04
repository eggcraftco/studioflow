#!/usr/bin/env bash
# Security Command Center on the Amazon project. Step 6 of the design — a ⛔
# gate: the estimated cost is read from the console and shown to the user
# before anything here runs with DRY_RUN=0.
#
# Two halves. The first is what gcloud can do: the API, the findings → Pub/Sub
# notification, and an alert that emails the operator whenever a finding lands.
# The second — activating the Premium tier at PROJECT level, pay-as-you-go —
# is done in the console (Security Command Center → Get started → this project
# only → Premium), where the price estimate is displayed; that is the number to
# show before switching it on.
set -euo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
EMAIL="${ALERT_EMAIL:-contact@eggcraft.co.uk}"
DRY_RUN="${DRY_RUN:-1}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created."

echo "══ 1. API ══"
run gcloud services enable securitycenter.googleapis.com --project="$PROJECT"

echo "══ 2. Tier — in the console, after the cost is shown ══"
cat <<EOF
  Console → Security Command Center → project $PROJECT → Premium, pay-as-you-go, project-level.
  Read the displayed monthly estimate (it is a percentage of this project's own spend).
  Enable: Event Threat Detection (all rules), Cloud Run Threat Detection, Security Health Analytics,
  Web Security Scanner (target https://amazon.nivadesk.app once DNS resolves).
  Confirm Cloud Run Threat Detection is available at project level in $REGION; if it is not,
  that is a reason to revisit the tier, not to skip the detector.
EOF

echo "══ 3. Findings → Pub/Sub (project-level notification config) ══"
exists gcloud pubsub topics describe scc-findings --project="$PROJECT" \
  || run gcloud pubsub topics create scc-findings --project="$PROJECT"
exists gcloud scc notifications describe amazon-findings --project="$PROJECT" \
  || run gcloud scc notifications create amazon-findings --project="$PROJECT" \
       --pubsub-topic="projects/$PROJECT/topics/scc-findings" \
       --filter='state = "ACTIVE" AND (severity = "HIGH" OR severity = "CRITICAL")' \
       --description="Amazon zone: high and critical findings"

echo "══ 4. A finding pages a person: email channel + alert on the topic ══"
CHANNEL=$( [ "$DRY_RUN" = "1" ] && echo "<channel-id>" || gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName='amazon-security-email'" --format='value(name)' | head -1)
if [ -z "$CHANNEL" ] || [ "$CHANNEL" = "<channel-id>" ]; then
  run gcloud beta monitoring channels create --project="$PROJECT" --display-name="amazon-security-email" \
      --type=email --channel-labels="email_address=$EMAIL"
fi
POLICY=$(mktemp)
cat > "$POLICY" <<'YAML'
displayName: "Amazon zone: SCC finding published"
combiner: OR
conditions:
  - displayName: "a message landed on scc-findings"
    conditionThreshold:
      filter: 'resource.type = "pubsub_topic" AND resource.labels.topic_id = "scc-findings" AND metric.type = "pubsub.googleapis.com/topic/send_message_operation_count"'
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_SUM
alertStrategy:
  autoClose: 86400s
YAML
echo "  alert policy prepared at $POLICY (created with the email channel when DRY_RUN=0)"
if [ "$DRY_RUN" != "1" ]; then
  CHANNEL=$(gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName='amazon-security-email'" --format='value(name)' | head -1)
  gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY" --notification-channels="$CHANNEL" >/dev/null
fi
rm -f "$POLICY"

echo "══ 5. Detection test for the evidence pack (run after activation) ══"
cat <<'EOF'
  Google publishes benign triggers for Event Threat Detection and Cloud Run Threat Detection
  (Security Command Center docs → "Test Event Threat Detection" / "Test Cloud Run Threat Detection").
  Run one, capture the finding (gcloud scc findings list --project=... --filter=...) and the email —
  both go into docs/security/evidence/amazon/ via infra/amazon/evidence.sh.
EOF
echo "══ done ══"
