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
# The roles this run needs on the ORGANISATION, and why. Organization
# Administrator alone grants none of them — the first real run stopped at the
# folder with PERMISSION_DENIED. Checked up front so the failure is one clear
# line, not a half-created hierarchy.
NEEDED_ORG_ROLES="roles/resourcemanager.folderCreator roles/resourcemanager.projectCreator roles/logging.admin"
if [ -n "$ACCOUNT" ]; then
  HELD=$(gcloud organizations get-iam-policy "$ORG_ID" --format=json 2>/dev/null | python3 -c "
import json,sys
try: p=json.load(sys.stdin)
except Exception: p={}
print(' '.join(b['role'] for b in p.get('bindings',[]) if 'user:$ACCOUNT' in b.get('members',[])))" 2>/dev/null || echo "")
  missing=""
  for r in $NEEDED_ORG_ROLES; do echo " $HELD " | grep -q " $r " || missing="$missing $r"; done
  if [ -n "$missing" ]; then
    echo "  ⚠ organisation roles missing for $ACCOUNT:$missing"
    echo "    grant (as Organization Administrator), then re-run:"
    for r in $missing; do echo "      gcloud organizations add-iam-policy-binding $ORG_ID --member=user:$ACCOUNT --role=$r"; done
    [ "$DRY_RUN" = "1" ] || { echo "  aborting before anything is created."; exit 1; }
  else
    echo "  organisation roles: folderCreator, projectCreator, logging.admin ✓"
  fi
fi

echo "══ 0.5. Folder, and its Logging defaults — BEFORE the project exists ══"
# A project's _Required log bucket is created at project creation, in the
# location the parent's Logging settings name, and can never be moved. So the
# folder comes first, its default storage location is set to europe-west2,
# and its _Default sink is disabled for new projects: every log line then
# lands in the regional 400-day amazon-audit bucket (our own sink, no filter)
# and in the regional _Required bucket, and nothing in a global bucket.
FOLDER_NAME="amazon-boundary"
FOLDER_ID=$( [ "$DRY_RUN" = "1" ] && echo "<folder>" || gcloud resource-manager folders list --organization="$ORG_ID" --filter="displayName=$FOLDER_NAME" --format='value(name)' | sed 's|folders/||' | head -1)
if [ -z "$FOLDER_ID" ] || [ "$FOLDER_ID" = "<folder>" ]; then
  run gcloud resource-manager folders create --display-name="$FOLDER_NAME" --organization="$ORG_ID"
  [ "$DRY_RUN" = "1" ] || FOLDER_ID=$(gcloud resource-manager folders list --organization="$ORG_ID" --filter="displayName=$FOLDER_NAME" --format='value(name)' | sed 's|folders/||' | head -1)
fi
echo "  folder: $FOLDER_NAME ($FOLDER_ID)"
run gcloud logging settings update --folder="$FOLDER_ID" --storage-location="$REGION" --disable-default-sink

echo "══ 1. Project (inside the folder) ══"
if exists gcloud projects describe "$PROJECT"; then
  echo "  project exists"
else
  run gcloud projects create "$PROJECT" --folder="$FOLDER_ID" --name="NivaDesk Amazon" \
    --labels=boundary=amazon,data=amazon-information
fi
run gcloud billing projects link "$PROJECT" --billing-account="$BILLING"
PROJECT_NUMBER=$( [ "$DRY_RUN" = "1" ] && echo "<number>" || gcloud projects describe "$PROJECT" --format='value(projectNumber)')

echo "══ 1.5. Core APIs the policy step itself needs ══"
run gcloud services enable --project="$PROJECT" serviceusage.googleapis.com cloudresourcemanager.googleapis.com orgpolicy.googleapis.com

echo "══ 2. Organisation policies on the project (§2) — before compute is enabled, so no default network and no Editor grant ever exist ══"
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
# Every Cloud Run revision must send ALL traffic through the VPC: a revision
# on private-ranges-only would reach the internet directly and bypass the
# NAT, the firewall, the flow logs and the static address. deploy.sh also
# checks that VPC egress is configured at all, which a policy cannot.
policy run.allowedVPCEgress                             $'  - values:\n      allowedValues:\n        - all-traffic'
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
  dns.googleapis.com pubsub.googleapis.com firebase.googleapis.com
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

echo "══ 7. Secret Manager: the two shared secrets, created EMPTY, user-managed in $REGION only ══"
# Never automatic replication: with gcp.resourceLocations = europe-west2 a
# globally replicated secret is refused, and it would put the material in
# regions the design does not name. The per-connection refresh-token secrets
# (functions-amazon/src/connections.js) are created the same way.
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
# No filter: with the _Default sink disabled at the folder, this sink is the
# one place every log line of the project goes — regional, 400 days.
exists gcloud logging sinks describe amazon-audit-sink --project="$PROJECT" \
  || run gcloud logging sinks create amazon-audit-sink "logging.googleapis.com/projects/$PROJECT/locations/$REGION/buckets/amazon-audit" \
       --project="$PROJECT" --description="everything, regional, 400 days"
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

echo "══ 10.5. Verify what cannot be fixed later: every log bucket is regional ══"
if [ "$DRY_RUN" != "1" ]; then
  bad=0
  while IFS=$'\t' read -r name location; do
    printf '  %s → %s\n' "$name" "$location"
    [ "$location" = "$REGION" ] || bad=1
  done < <(gcloud logging buckets list --project="$PROJECT" --format='value(name,location)')
  if [ "$bad" = "1" ]; then
    echo "  ❌ a log bucket is outside $REGION. _Required cannot be moved: delete the project now, fix the folder's Logging settings, recreate."
    exit 1
  fi
  echo "  ✓ _Required, _Default and amazon-audit are all in $REGION"
  echo "  run.allowedVPCEgress reads back as: $(gcloud org-policies describe run.allowedVPCEgress --project="$PROJECT" --format='value(spec.rules[0].values.allowedValues)')"
else
  echo "  [dry-run] gcloud logging buckets list --project=$PROJECT  → every location must be $REGION, else the script exits 1"
fi

echo "══ 11. Cross-project: the bridge caller in the MAIN project (no grant yet) ══"
echo "  amazon-caller@eggcraft-studio is created in the main project by infra/amazon/main-project-side.sh,"
echo "  and amazon-sync@$PROJECT gets run.invoker on ingestAmazonEnvelope there — both in step 4."

echo "══ done ══"
echo "  Next: functions-amazon/deploy/deploy.sh (services), infra/amazon/create-edge.sh (LB + Cloud Armor; DNS is a gate),"
echo "        infra/amazon/scc.sh (gate), infra/amazon/perimeter.sh (dry-run, then gate)."
