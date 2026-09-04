#!/usr/bin/env bash
# Creates the Amazon project — nivadesk-amazon — exactly as designed in
# docs/security/amazon-hardened-project-design.md §14.3, and nothing else.
#
# NOT TO BE RUN without the user's explicit go-ahead in chat, after the four
# items in §14 have been shown. It creates billable resources.
#
# Idempotent: every step checks before it creates, so a partial run can be
# re-run. What it deliberately does NOT do — each is its own sign-off step:
#   - Security Command Center (step 6)
#   - the VPC Service Controls perimeter (steps 7–8)
#   - the load balancer, certificate, Cloud Armor and DNS (step 5)
#   - the Cloud Run services themselves (step 4, from functions-amazon/deploy)
#   - putting values into the secrets (the user, in the console — never chat)
#
# Requires: gcloud authenticated as the audited operator account, with
# Organization Policy Administrator and Project Creator on the organisation.
set -euo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

ORG_ID="378239481010"                      # eggcraft.co.uk
BILLING="01789B-AD5731-2C3C72"
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
SUBNET_RANGE="10.60.0.0/24"
MAIN_PROJECT_NUMBER="477037475099"        # eggcraft-studio, for the bridge invoker grant later

DRY_RUN="${DRY_RUN:-1}"                    # 1 = print what would run; 0 = run
run() {
  if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi
}
exists() { "$@" >/dev/null 2>&1; }

echo "══ 0. Guard ══"
if [ "$DRY_RUN" = "1" ]; then
  echo "  DRY_RUN=1: nothing will be created. Set DRY_RUN=0 only after approval."
fi
ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
echo "  operator: ${ACCOUNT:-<none>}   project: $PROJECT   region: $REGION"

echo "══ 1. Project ══"
if exists gcloud projects describe "$PROJECT"; then
  echo "  project exists"
else
  run gcloud projects create "$PROJECT" --organization="$ORG_ID" --name="NivaDesk Amazon" \
    --labels=boundary=amazon,data=amazon-information
fi
run gcloud billing projects link "$PROJECT" --billing-account="$BILLING"
PROJECT_NUMBER=$( [ "$DRY_RUN" = "1" ] && echo "<number>" || gcloud projects describe "$PROJECT" --format='value(projectNumber)')

echo "══ 2. Organisation policies on the project (§2) ══"
# Each policy is written as a small YAML and set with the v2 org-policy API.
policy() {
  local constraint="$1" body="$2" file
  file=$(mktemp)
  printf 'name: projects/%s/policies/%s\nspec:\n  rules:\n%s\n' "$PROJECT" "$constraint" "$body" > "$file"
  # The dry run shows the policy itself, not a temp-file path.
  [ "$DRY_RUN" = "1" ] && printf '  [dry-run] org-policy %s ← %s\n' "$constraint" "$(printf '%s' "$body" | tr -d '\n' | sed 's/  */ /g')"
  run gcloud org-policies set-policy "$file" --project="$PROJECT"
  rm -f "$file"
}
policy run.allowedIngress                               $'  - values:\n      allowedValues:\n        - internal-and-cloud-load-balancing'
policy iam.disableServiceAccountKeyCreation             $'  - enforce: true'
policy iam.automaticIamGrantsForDefaultServiceAccounts  $'  - enforce: true'
policy compute.vmExternalIpAccess                       $'  - denyAll: true'
policy compute.restrictVpcPeering                       $'  - denyAll: true'
policy compute.skipDefaultNetworkCreation               $'  - enforce: true'
policy gcp.resourceLocations                            $'  - values:\n      allowedValues:\n        - in:europe-west2-locations'
policy storage.uniformBucketLevelAccess                 $'  - enforce: true'

echo "══ 3. APIs (§14.3) ══"
run gcloud services enable --project="$PROJECT" \
  compute.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com orgpolicy.googleapis.com serviceusage.googleapis.com \
  pubsub.googleapis.com firebase.googleapis.com
# Not enabled here, on purpose: securitycenter.googleapis.com (step 6),
# accesscontextmanager.googleapis.com (steps 7–8).

echo "══ 4. Service accounts (§4) ══"
for sa in amazon-oauth amazon-admin amazon-sync amazon-deploy; do
  if exists gcloud iam service-accounts describe "$sa@$PROJECT.iam.gserviceaccount.com" --project="$PROJECT"; then
    echo "  $sa exists"
  else
    run gcloud iam service-accounts create "$sa" --project="$PROJECT" --display-name="$sa"
  fi
done
grant() { run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$1@$PROJECT.iam.gserviceaccount.com" --role="$2" --condition=None --quiet; }
for sa in amazon-oauth amazon-admin amazon-sync; do
  grant "$sa" roles/datastore.user
  grant "$sa" roles/logging.logWriter
done
grant amazon-deploy roles/run.admin
grant amazon-deploy roles/cloudbuild.builds.editor
grant amazon-deploy roles/artifactregistry.writer
for sa in amazon-oauth amazon-admin amazon-sync; do
  run gcloud iam service-accounts add-iam-policy-binding "$sa@$PROJECT.iam.gserviceaccount.com" --project="$PROJECT" \
    --member="serviceAccount:amazon-deploy@$PROJECT.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser --quiet
done
# The operator deploys by impersonating amazon-deploy; no keys anywhere.
[ -n "${ACCOUNT:-}" ] && run gcloud iam service-accounts add-iam-policy-binding "amazon-deploy@$PROJECT.iam.gserviceaccount.com" \
  --project="$PROJECT" --member="user:$ACCOUNT" --role=roles/iam.serviceAccountTokenCreator --quiet
# Secret-level bindings (accessor / adder / destroyer on amazon-refresh-*) are
# granted when the secrets exist — see functions-amazon/deploy/secrets.sh.

echo "══ 5. VPC, subnet, firewall, router, NAT, static IP (§6) ══"
exists gcloud compute networks describe amazon-vpc --project="$PROJECT" \
  || run gcloud compute networks create amazon-vpc --project="$PROJECT" --subnet-mode=custom
exists gcloud compute networks subnets describe amazon-subnet --region="$REGION" --project="$PROJECT" \
  || run gcloud compute networks subnets create amazon-subnet --project="$PROJECT" --network=amazon-vpc \
       --region="$REGION" --range="$SUBNET_RANGE" --enable-private-ip-google-access \
       --enable-flow-logs --logging-aggregation-interval=interval-5-sec --logging-flow-sampling=1.0 --logging-metadata=include-all
exists gcloud compute firewall-rules describe amazon-deny-all-egress --project="$PROJECT" \
  || run gcloud compute firewall-rules create amazon-deny-all-egress --project="$PROJECT" --network=amazon-vpc \
       --direction=EGRESS --priority=65000 --action=DENY --rules=all --destination-ranges=0.0.0.0/0 --enable-logging
exists gcloud compute firewall-rules describe amazon-allow-https-egress --project="$PROJECT" \
  || run gcloud compute firewall-rules create amazon-allow-https-egress --project="$PROJECT" --network=amazon-vpc \
       --direction=EGRESS --priority=1000 --action=ALLOW --rules=tcp:443 --destination-ranges=0.0.0.0/0 --enable-logging
# No ingress rules at all: the implied deny-all-ingress stands.
exists gcloud compute addresses describe amazon-egress --region="$REGION" --project="$PROJECT" \
  || run gcloud compute addresses create amazon-egress --project="$PROJECT" --region="$REGION" --network-tier=PREMIUM
exists gcloud compute routers describe amazon-router --region="$REGION" --project="$PROJECT" \
  || run gcloud compute routers create amazon-router --project="$PROJECT" --network=amazon-vpc --region="$REGION"
exists gcloud compute routers nats describe amazon-nat --router=amazon-router --region="$REGION" --project="$PROJECT" \
  || run gcloud compute routers nats create amazon-nat --project="$PROJECT" --router=amazon-router --region="$REGION" \
       --nat-custom-subnet-ip-ranges=amazon-subnet --nat-external-ip-pool=amazon-egress \
       --enable-logging --log-filter=ALL

echo "══ 6. Firestore (native, London) and Firebase ══"
exists gcloud firestore databases describe --database='(default)' --project="$PROJECT" \
  || run gcloud firestore databases create --project="$PROJECT" --location="$REGION" --type=firestore-native \
       --delete-protection
run firebase projects:addfirebase "$PROJECT" --non-interactive
# Rules: deny everything to every client. Deployed from functions-amazon/deploy/firestore.rules.

echo "══ 7. Secret Manager: the two shared secrets, created EMPTY ══"
for secret in lwa-client-secret intent-hmac-key; do
  exists gcloud secrets describe "$secret" --project="$PROJECT" \
    || run gcloud secrets create "$secret" --project="$PROJECT" --replication-policy=user-managed --locations="$REGION"
done
echo "  ⚠  Values are added by the user in the console (Secret Manager → Add version). Never through chat."

echo "══ 8. Artifact Registry ══"
exists gcloud artifacts repositories describe amazon --location="$REGION" --project="$PROJECT" \
  || run gcloud artifacts repositories create amazon --project="$PROJECT" --location="$REGION" --repository-format=docker

echo "══ 9. Logging: 400-day audit bucket, sink, data-access audit logs (§8) ══"
exists gcloud logging buckets describe amazon-audit --location="$REGION" --project="$PROJECT" \
  || run gcloud logging buckets create amazon-audit --project="$PROJECT" --location="$REGION" --retention-days=400 \
       --description="Amazon zone: audit, Cloud Armor, NAT, flow logs — 400 days"
exists gcloud logging sinks describe amazon-audit-sink --project="$PROJECT" \
  || run gcloud logging sinks create amazon-audit-sink "logging.googleapis.com/projects/$PROJECT/locations/$REGION/buckets/amazon-audit" \
       --project="$PROJECT" \
       --log-filter='logName:"cloudaudit.googleapis.com" OR resource.type="http_load_balancer" OR resource.type="nat_gateway" OR resource.type="gce_subnetwork" OR resource.type="cloud_run_revision"'
AUDIT_FILE=$(mktemp)
cat > "$AUDIT_FILE" <<'YAML'
auditConfigs:
- service: firestore.googleapis.com
  auditLogConfigs:
  - logType: DATA_READ
  - logType: DATA_WRITE
- service: secretmanager.googleapis.com
  auditLogConfigs:
  - logType: DATA_READ
  - logType: DATA_WRITE
YAML
echo "  data-access audit config prepared at $AUDIT_FILE (merged into the project IAM policy when DRY_RUN=0)"
if [ "$DRY_RUN" != "1" ]; then
  gcloud projects get-iam-policy "$PROJECT" --format=json > "$AUDIT_FILE.policy.json"
  python3 - "$AUDIT_FILE.policy.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
p["auditConfigs"] = [
  {"service": "firestore.googleapis.com", "auditLogConfigs": [{"logType": "DATA_READ"}, {"logType": "DATA_WRITE"}]},
  {"service": "secretmanager.googleapis.com", "auditLogConfigs": [{"logType": "DATA_READ"}, {"logType": "DATA_WRITE"}]},
]
json.dump(p, open(sys.argv[1], "w"), indent=2)
PY
  gcloud projects set-iam-policy "$PROJECT" "$AUDIT_FILE.policy.json" >/dev/null
fi
rm -f "$AUDIT_FILE"

echo "══ 10. Pub/Sub topic for SCC findings (empty until step 6) ══"
exists gcloud pubsub topics describe scc-findings --project="$PROJECT" \
  || run gcloud pubsub topics create scc-findings --project="$PROJECT"

echo "══ 11. Cross-project: the bridge caller in the MAIN project (no grant yet) ══"
echo "  amazon-caller@eggcraft-studio is created in the main project by infra/amazon/main-project-side.sh,"
echo "  and amazon-sync@$PROJECT gets run.invoker on ingestAmazonEnvelope there — both in step 4."

echo "══ done ══"
echo "  Next: functions-amazon/deploy/deploy.sh (services), infra/amazon/create-edge.sh (LB + Cloud Armor; DNS is a gate),"
echo "        infra/amazon/scc.sh (gate), infra/amazon/perimeter.sh (dry-run, then gate)."
