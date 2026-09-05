#!/usr/bin/env bash
# One benign detection for the evidence pack, from Google's own test guidance
# for Event Threat Detection: a service account inspecting the IAM policy of
# its own project raises "Discovery: Service Account Self-Investigation".
# Runs AFTER the Premium tier is active and scc.sh has created the
# notification config. Nothing is changed anywhere: the trigger is a read
# (and for amazon-deploy@ a refused one — the audit log entry is what counts).
#
# Then it waits for the finding, pulls the copy Pub/Sub kept on the evidence
# subscription, and writes docs/security/evidence/amazon/scc-test-<date>.txt.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
export CLOUDSDK_CORE_PROJECT="$PROJECT"
SA="amazon-deploy@$PROJECT.iam.gserviceaccount.com"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/security/evidence/amazon/scc-test-$(date -u +%Y-%m-%d).txt"
CATEGORY="Discovery: Service Account Self-Investigation"
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "# $STAMP — Event Threat Detection test (Google's documented benign trigger)"
  echo "# gcloud projects get-iam-policy $PROJECT --impersonate-service-account=$SA"
  echo
  echo "trigger: $SA reads the IAM policy of its own project at $STAMP"
  gcloud projects get-iam-policy "$PROJECT" --impersonate-service-account="$SA" >/dev/null 2>&1 && echo "  (call allowed)" || echo "  (call refused by IAM — the audit log entry exists either way)"
} | tee "$OUT"
echo "waiting for the finding (up to 20 minutes, polling every 60 s)…"
found=""
for i in $(seq 1 20); do
  found=$(gcloud scc findings list --project="$PROJECT" --filter="category=\"$CATEGORY\" AND event_time > \"$STAMP\"" --format='value(finding.name,finding.severity,finding.eventTime,finding.resourceName)' 2>/dev/null | head -1)
  [ -n "$found" ] && break
  sleep 60
done
{
  echo
  if [ -n "$found" ]; then echo "finding: $found"; else echo "finding: NOT seen within 20 minutes (category \"$CATEGORY\")"; fi
  echo
  echo "== every finding of that category on the project"
  gcloud scc findings list --project="$PROJECT" --filter="category=\"$CATEGORY\"" --format='table(finding.category,finding.severity,finding.eventTime,finding.state)' 2>&1 | head -10
  echo
  echo "== delivery: messages kept on subscription scc-findings-evidence (pulled, not acked)"
  gcloud pubsub subscriptions pull scc-findings-evidence --project="$PROJECT" --limit=5 --format='value(message.publishTime,message.data.decode(base64).extract("category").flatten())' 2>&1 | head -10
  echo
  echo "== alert policy that emails the operator"
  gcloud alpha monitoring policies list --project="$PROJECT" --filter='displayName="Amazon zone: SCC finding published"' --format='value(displayName,enabled,notificationChannels)' 2>&1 | tr '\t' ' '
} | tee -a "$OUT"
echo "record: $OUT"
[ -n "$found" ]
