#!/usr/bin/env bash
# Security Command Center on the Amazon project. Step 6 of the design — a ⛔
# gate: the estimated cost is read from the console and shown to the user
# before anything here runs with DRY_RUN=0.
#
# 2026-09-05: the project-level console activation is stuck — the console
# first calls SecurityCenterManagement.GenerateServiceAccounts, which answers
# FAILED_PRECONDITION "project is already onboarded" (the securitycenter API
# had been enabled by this script before the console flow ran), and the
# console refuses to activate without it; disabling both SCC APIs does not
# clear the backend state. Way forward: activate Standard at the ORGANISATION
# (free; console → select the organisation → Get Standard; needs
# roles/securitycenter.admin on the organisation) and then set this project's
# tier to Premium under Settings → Tier details → Manage project tier — or a
# Google support case for the stuck project. Lesson: never enable
# securitycenter.googleapis.com by hand before the console activation.
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
# scc/monitoring calls are quota-attributed to gcloud's core project; make it
# this one (where step 1 enables the API), not whatever the shell defaults to.
export CLOUDSDK_CORE_PROJECT="$PROJECT"
REGION="europe-west2"
EMAIL="${ALERT_EMAIL:-contact@eggcraft.co.uk}"
DRY_RUN="${DRY_RUN:-1}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created."
TMPERR=$(mktemp); NOTIF_PENDING=0
trap 'rm -f "$TMPERR"' EXIT

echo "══ 1. API — enabled by the console activation itself; NOT here (see the note above) ══"
gcloud services list --enabled --project="$PROJECT" --format='value(config.name)' | grep -q '^securitycenter.googleapis.com$' && echo "  securitycenter API is enabled" || echo "  securitycenter API not enabled yet: activate the tier in the console first"

echo "══ 2. Tier — console only (Google documents no gcloud/API path for project-level Premium) ══"
cat <<EOF
  https://console.cloud.google.com/security/command-center/overview?project=$PROJECT
  as the operator (needs securitycenter.admin + iam.securityAdmin on the project; Owner has them):
  "Start a Premium free trial" → Activate. The trial is 30 days and then transitions to
  Premium pay-as-you-go by itself (project-level pricing: usage-based — Cloud Run vCPU-hours at
  \$0.0071 from 1 Jan 2026, Artifact Analysis \$0.20 per image scan, Storage operations; no minimum).
  Premium enables Event Threat Detection, Security Health Analytics, Web Security Scanner and the
  VM/container detectors by default; Cloud Run Threat Detection is switched on afterwards under
  Settings → Services (or gcloud scc manage services).
EOF

echo "══ 3. A finding pages a person: email channel + alert on the topic ══"
# (the filter needs the value double-quoted; single quotes silently match nothing)
CHANNEL=$( [ "$DRY_RUN" = "1" ] && echo "<channel-id>" || gcloud beta monitoring channels list --project="$PROJECT" --filter='displayName="amazon-security-email"' --format='value(name)' | head -1)
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
  CHANNEL=$(gcloud beta monitoring channels list --project="$PROJECT" --filter='displayName="amazon-security-email"' --format='value(name)' | head -1)
  EXISTING=$(gcloud alpha monitoring policies list --project="$PROJECT" --filter='displayName="Amazon zone: SCC finding published"' --format='value(name)' | head -1)
  if [ -z "$EXISTING" ]; then
    gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY" --notification-channels="$CHANNEL" >/dev/null
    echo "  alert policy created → $CHANNEL"
  else
    gcloud alpha monitoring policies update "$EXISTING" --project="$PROJECT" --add-notification-channels="$CHANNEL" >/dev/null 2>&1 || true
    echo "  alert policy exists → $CHANNEL"
  fi
fi
rm -f "$POLICY"

echo "══ 4. Findings → Pub/Sub (project-level notification config; needs the tier) ══"
exists gcloud pubsub topics describe scc-findings --project="$PROJECT" \
  || run gcloud pubsub topics create scc-findings --project="$PROJECT"
# This is the one step that needs the tier: before Standard/Premium is active on
# the project the API answers "Security Command Center Legacy has been
# permanently disabled" — meaning "activate a tier first", not a legacy install.
if exists gcloud scc notifications describe amazon-findings --project="$PROJECT"; then
  echo "  notification config amazon-findings exists"
elif [ "$DRY_RUN" = "1" ]; then
  run gcloud scc notifications create amazon-findings --project="$PROJECT" --pubsub-topic="projects/$PROJECT/topics/scc-findings" --filter='state = "ACTIVE"'
elif gcloud scc notifications create amazon-findings --project="$PROJECT" \
       --pubsub-topic="projects/$PROJECT/topics/scc-findings" \
       --filter='state = "ACTIVE"' \
       --description="Amazon zone: every active finding (a dedicated project: volume is small, and every finding should reach a person)" >/dev/null 2>"$TMPERR"; then
  echo "  notification config amazon-findings created (every ACTIVE finding → scc-findings)"
elif grep -q "Legacy has been permanently disabled" "$TMPERR"; then
  echo "  ⏸ notification config not created: no Security Command Center tier is active on $PROJECT yet."
  echo "    Activate Premium in the console (step 2), then re-run this script."
  NOTIF_PENDING=1
else
  cat "$TMPERR"; exit 1
fi

# A pull subscription keeps every published finding for the evidence pack
# (without a subscriber, Pub/Sub drops messages on the floor).
exists gcloud pubsub subscriptions describe scc-findings-evidence --project="$PROJECT" \
  || run gcloud pubsub subscriptions create scc-findings-evidence --project="$PROJECT" --topic=scc-findings \
       --message-retention-duration=7d --expiration-period=never

echo "══ 5. Detection test for the evidence pack (run after activation) ══"
cat <<'EOF'
  Google publishes benign triggers for Event Threat Detection and Cloud Run Threat Detection
  (Security Command Center docs → "Test Event Threat Detection" / "Test Cloud Run Threat Detection").
  Run one, capture the finding (gcloud scc findings list --project=... --filter=...) and the email —
  both go into docs/security/evidence/amazon/ via infra/amazon/evidence.sh.
EOF
[ "$NOTIF_PENDING" = "1" ] && echo "══ done — except the notification config: activate the tier, re-run ══" || echo "══ done ══"
