#!/usr/bin/env bash
# Reads the Amazon project back and says whether it is what the design says.
# Read-only; safe at any time; exits non-zero on any mismatch. The same
# checks feed the evidence pack.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
# Organisation-level Access Context Manager calls are quota-attributed to
# gcloud's core project; make it the Amazon project, where that API is enabled.
export CLOUDSDK_CORE_PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
ORG_ID="378239481010"
bad=0
ok()   { printf '  ✓ %s\n' "$*"; }
fail() { printf '  ❌ %s\n' "$*"; bad=1; }

echo "══ project ══"
STATE=$(gcloud projects describe "$PROJECT" --format='value(lifecycleState)' 2>/dev/null || echo "")
[ "$STATE" = "ACTIVE" ] && ok "project $PROJECT ACTIVE" || fail "project $PROJECT: ${STATE:-missing}"
PARENT=$(gcloud projects describe "$PROJECT" --format='value(parent.type,parent.id)' 2>/dev/null | tr '\t' '/')
FOLDER=$(gcloud resource-manager folders list --organization="$ORG_ID" --filter="displayName=amazon-boundary" --format='value(name)' 2>/dev/null | sed 's|folders/||' | head -1)
[ "$PARENT" = "folder/$FOLDER" ] && ok "parent is folder amazon-boundary ($FOLDER)" || fail "parent is $PARENT, expected folder/$FOLDER"
BILLING=$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null)
[ "$BILLING" = "True" ] && ok "billing linked" || fail "billing not linked"

echo "══ folder logging defaults ══"
if [ -n "$FOLDER" ]; then
  SETTINGS_ERR=$(mktemp)
  SETTINGS=$(gcloud logging settings describe --folder="$FOLDER" --format='value(storageLocation,disableDefaultSink)' 2>"$SETTINGS_ERR" | tr '\t' ' ')
  if [ -z "$SETTINGS" ] && grep -q "logging.settings.get' denied" "$SETTINGS_ERR"; then
    # The operator's organisation-level logging.admin was a temporary bootstrap
    # role, removed 2026-09-05 (docs/security/evidence/amazon/bootstrap-iam-reduction.md);
    # without it the folder's settings cannot be read. They were read and
    # recorded before the removal, and for THIS project the bucket locations
    # checked below are the effective proof. A warning, not a mismatch.
    printf '  ⚠ folder settings not readable with current roles (logging.settings.get denied; logging.admin removed 2026-09-05) — the project-level bucket checks below are the effective proof\n'
  else
    echo "$SETTINGS" | grep -q "$REGION" && ok "folder storage location $REGION" || fail "folder storage location: $SETTINGS"
    echo "$SETTINGS" | grep -qi "true" && ok "folder _Default sink disabled for new projects" || fail "folder _Default sink not disabled: $SETTINGS"
  fi
  rm -f "$SETTINGS_ERR"
fi

echo "══ org policies on the project ══"
# macOS ships bash 3.2 (no associative arrays); a function does the lookup.
want_value() { case "$1" in
  run.allowedIngress) echo "internal-and-cloud-load-balancing" ;;
  run.allowedVPCEgress) echo "all-traffic" ;;
  gcp.resourceLocations) echo "in:europe-west2-locations" ;;
esac; }
for c in run.allowedIngress run.allowedVPCEgress gcp.resourceLocations; do
  got=$(gcloud org-policies describe "$c" --project="$PROJECT" --format='value(spec.rules[0].values.allowedValues)' 2>/dev/null)
  [ "$got" = "$(want_value "$c")" ] && ok "$c = $got" || fail "$c = '$got', expected $(want_value "$c")"
done
for c in iam.disableServiceAccountKeyCreation iam.automaticIamGrantsForDefaultServiceAccounts compute.skipDefaultNetworkCreation storage.uniformBucketLevelAccess; do
  got=$(gcloud org-policies describe "$c" --project="$PROJECT" --format='value(spec.rules[0].enforce)' 2>/dev/null)
  [ "$got" = "True" ] && ok "$c enforced" || fail "$c enforce = '$got'"
done
for c in compute.vmExternalIpAccess compute.restrictVpcPeering; do
  got=$(gcloud org-policies describe "$c" --project="$PROJECT" --format='value(spec.rules[0].denyAll)' 2>/dev/null)
  [ "$got" = "True" ] && ok "$c denyAll" || fail "$c denyAll = '$got'"
done

echo "══ log buckets — every one regional ══"
# gcloud's value(name) for log buckets does not print the full resource name;
# the JSON does, and the location is a segment of it.
while IFS=$'\t' read -r short location retention; do
  [ "$location" = "$REGION" ] && ok "$short in $location (${retention}d)" || fail "$short in '$location' — NOT $REGION"
done < <(gcloud logging buckets list --project="$PROJECT" --format=json 2>/dev/null | python3 -c "
import json,sys,re
for b in json.load(sys.stdin):
    m=re.search(r'/locations/([^/]+)/buckets/([^/]+)$', b.get('name',''))
    print((m.group(2) if m else b.get('name','?')) + '\t' + (m.group(1) if m else '') + '\t' + str(b.get('retentionDays','')))")
SINK=$(gcloud logging sinks describe amazon-audit-sink --project="$PROJECT" --format='value(destination,filter)' 2>/dev/null)
echo "$SINK" | grep -q "buckets/amazon-audit" && ok "sink amazon-audit-sink → amazon-audit (filter: '${SINK#*$'\t'}')" || fail "sink amazon-audit-sink missing"
DEF=$(gcloud logging sinks describe _Default --project="$PROJECT" --format='value(disabled)' 2>/dev/null)
[ "$DEF" = "True" ] && ok "_Default sink disabled" || fail "_Default sink disabled = '$DEF'"
AUD=$(gcloud projects get-iam-policy "$PROJECT" --format='value(auditConfigs.service)' 2>/dev/null)
echo "$AUD" | grep -q datastore && echo "$AUD" | grep -q secretmanager && ok "data-access audit logs: datastore(firestore) + secretmanager" || fail "data-access audit config: '$AUD'"

echo "══ network ══"
NET=$(gcloud compute networks list --project="$PROJECT" --format='value(name)' 2>/dev/null | tr '\n' ' ')
[ "$NET" = "amazon-vpc " ] && ok "only amazon-vpc exists (no default network)" || fail "networks: '$NET'"
SUB=$(gcloud compute networks subnets describe amazon-subnet --region="$REGION" --project="$PROJECT" --format='value(ipCidrRange,privateIpGoogleAccess,enableFlowLogs)' 2>/dev/null | tr '\t' ' ')
[ "$SUB" = "10.60.0.0/24 True True" ] && ok "amazon-subnet 10.60.0.0/24, PGA on, flow logs on" || fail "amazon-subnet: '$SUB'"
RULES=$(gcloud compute firewall-rules list --project="$PROJECT" --format='value(name,direction,priority,allowed[].map().firewall_rule().list(),denied[].map().firewall_rule().list())' 2>/dev/null | sort)
echo "$RULES" | grep -q "amazon-deny-all-egress.*EGRESS.*65000" && ok "egress deny-all @65000" || fail "deny-all egress rule missing"
echo "$RULES" | grep -q "amazon-allow-https-egress.*EGRESS.*1000" && ok "egress allow tcp:443 @1000" || fail "allow-https egress rule missing"
INGRESS_RULES=$(echo "$RULES" | grep -c INGRESS || true)
[ "$INGRESS_RULES" = "0" ] && ok "no ingress firewall rules" || fail "$INGRESS_RULES ingress rule(s) exist"
NAT=$(gcloud compute routers nats describe amazon-nat --router=amazon-router --region="$REGION" --project="$PROJECT" --format='value(natIpAllocateOption,logConfig.enable,logConfig.filter)' 2>/dev/null | tr '\t' ' ')
[ "$NAT" = "MANUAL_ONLY True ALL" ] && ok "NAT manual IPs, logging ALL" || fail "NAT: '$NAT'"
IP=$(gcloud compute addresses describe amazon-egress --region="$REGION" --project="$PROJECT" --format='value(address,status)' 2>/dev/null | tr '\t' ' ')
[ -n "$IP" ] && ok "static egress IP $IP" || fail "static egress IP missing"

echo "══ private google access (restricted.googleapis.com) ══"
Z=$(gcloud dns managed-zones describe googleapis-restricted --project="$PROJECT" --format='value(visibility,privateVisibilityConfig.networks[0].networkUrl.basename())' 2>/dev/null | tr '\t' ' ')
[ "$Z" = "private amazon-vpc" ] && ok "private zone googleapis.com bound to amazon-vpc only" || fail "private zone: '$Z'"
CN=$(gcloud dns record-sets describe '*.googleapis.com.' --type=CNAME --zone=googleapis-restricted --project="$PROJECT" --format='value(rrdatas[0])' 2>/dev/null)
[ "$CN" = "restricted.googleapis.com." ] && ok "*.googleapis.com → restricted.googleapis.com" || fail "wildcard CNAME: '$CN'"
RA=$(gcloud dns record-sets describe restricted.googleapis.com. --type=A --zone=googleapis-restricted --project="$PROJECT" --format='value(rrdatas.list())' 2>/dev/null)
[ "$RA" = "199.36.153.4,199.36.153.5,199.36.153.6,199.36.153.7" ] && ok "restricted.googleapis.com A = 199.36.153.4-7" || fail "restricted A: '$RA'"
PL=$(gcloud dns policies describe amazon-dns-logging --project="$PROJECT" --format='value(enableLogging,networks[0].networkUrl.basename())' 2>/dev/null | tr '\t' ' ')
[ "$PL" = "True amazon-vpc" ] && ok "DNS query logging policy on amazon-vpc" || fail "dns logging policy: '$PL'"
RT=$(gcloud compute routes describe amazon-restricted-vip --project="$PROJECT" --format='value(destRange,priority,nextHopGateway.basename())' 2>/dev/null | tr '\t' ' ')
[ "$RT" = "199.36.153.4/30 900 default-internet-gateway" ] && ok "route 199.36.153.4/30 → default-internet-gateway @900" || fail "route: '$RT'"
echo "$RULES" | grep -q "amazon-allow-restricted-vip.*EGRESS.*900" && ok "egress allow tcp:443 to the restricted VIP @900" || fail "restricted-vip firewall rule missing"

echo "══ identities ══"
SAS=$(gcloud iam service-accounts list --project="$PROJECT" --format='value(email)' 2>/dev/null | sort | tr '\n' ' ')
for sa in amazon-oauth amazon-admin amazon-sync amazon-deploy; do echo "$SAS" | grep -q "$sa@" && ok "$sa@" || fail "$sa@ missing"; done
KEYS=$(gcloud iam service-accounts keys list --iam-account="amazon-sync@$PROJECT.iam.gserviceaccount.com" --managed-by=user --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')
[ "$KEYS" = "0" ] && ok "no user-managed keys on amazon-sync@" || fail "$KEYS user-managed key(s)"
DEPLOY_ROLES=$(gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null | python3 -c "
import json,sys; p=json.load(sys.stdin)
print(' '.join(sorted(b['role'] for b in p.get('bindings',[]) if 'serviceAccount:amazon-deploy@' in ' '.join(b.get('members',[])))))")
echo "$DEPLOY_ROLES" | grep -q "roles/amazonDeployer" && ! echo "$DEPLOY_ROLES" | grep -qE 'roles/run\.(admin|developer|invoker)' \
  && ok "amazon-deploy@ holds the custom deployer role and no predefined Cloud Run role" || fail "amazon-deploy@ roles: $DEPLOY_ROLES"
DEPLOY_PERMS=$(gcloud iam roles describe amazonDeployer --project="$PROJECT" --format='value(includedPermissions)' 2>/dev/null)
[ -n "$DEPLOY_PERMS" ] && ! echo "$DEPLOY_PERMS" | grep -qE 'invoke|jobs\.run|setIamPolicy|\.delete' \
  && ok "amazonDeployer has no invoke, IAM or delete permission" || fail "amazonDeployer permissions: '$DEPLOY_PERMS'"
DEFAULT_SA_ROLES=$(gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null | python3 -c "
import json,sys; p=json.load(sys.stdin)
print(' '.join(b['role'] for b in p.get('bindings',[]) if any(m.endswith('-compute@developer.gserviceaccount.com') for m in b.get('members',[]))))")
[ -z "$DEFAULT_SA_ROLES" ] && ok "default compute account holds no role" || fail "default compute account holds: $DEFAULT_SA_ROLES"

echo "══ data ══"
FS=$(gcloud firestore databases describe --database='(default)' --project="$PROJECT" --format='value(locationId,type,deleteProtectionState)' 2>/dev/null | tr '\t' ' ')
[ "$FS" = "$REGION FIRESTORE_NATIVE DELETE_PROTECTION_ENABLED" ] && ok "Firestore native, $REGION, delete protection" || fail "Firestore: '$FS'"
for s in lwa-client-secret intent-hmac-key; do
  rep=$(gcloud secrets describe "$s" --project="$PROJECT" --format='value(replication.userManaged.replicas[0].location)' 2>/dev/null)
  [ "$rep" = "$REGION" ] && ok "secret $s user-managed in $REGION" || fail "secret $s replication: '$rep'"
  vers=$(gcloud secrets versions list "$s" --project="$PROJECT" --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')
  echo "    versions: $vers $([ "$vers" = "0" ] && echo '(empty — value to be added by the user in the console)')"
done
AR=$(gcloud artifacts repositories describe amazon --location="$REGION" --project="$PROJECT" --format='value(format)' 2>/dev/null)
[ "$AR" = "DOCKER" ] && ok "Artifact Registry amazon (docker, $REGION)" || fail "Artifact Registry: '$AR'"
gcloud pubsub topics describe scc-findings --project="$PROJECT" >/dev/null 2>&1 && ok "Pub/Sub scc-findings" || fail "Pub/Sub scc-findings missing"

echo "══ APIs deliberately NOT enabled yet ══"
ENABLED=$(gcloud services list --enabled --project="$PROJECT" --format='value(config.name)' 2>/dev/null)
# Both were gates. Security Command Center was activated 2026-09-05 (Premium
# on the project); Access Context Manager is expected once the perimeter
# exists (dry-run first, enforce behind its own gate) and early before that.
echo "$ENABLED" | grep -q securitycenter.googleapis.com && ok "securitycenter API enabled (Premium active since 2026-09-05)" || fail "securitycenter API not enabled — SCC should be active"
if echo "$ENABLED" | grep -q accesscontextmanager.googleapis.com; then
  POL=$(gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' 2>/dev/null | head -1)
  PER=$( [ -n "$POL" ] && gcloud access-context-manager perimeters describe amazon_information --policy="$POL" --format='value(name)' 2>/dev/null || true)
  [ -n "$PER" ] && ok "accesscontextmanager API enabled and perimeter amazon_information exists ($(gcloud access-context-manager perimeters describe amazon_information --policy="$POL" --format='value(status.resources[0])' 2>/dev/null | grep -q . && echo ENFORCED || echo dry-run))" || fail "accesscontextmanager API enabled but no perimeter — enabled early"
else
  ok "accesscontextmanager API not enabled (perimeter not started yet)"
fi

echo
[ "$bad" = "0" ] && echo "VERIFY: project matches the design" || echo "VERIFY: mismatches above"
exit $bad
