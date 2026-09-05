#!/usr/bin/env bash
# The evidence pack: every artifact the second Developer Profile application
# attaches, regenerated from the live configuration, each with the command that
# produced it. Output under docs/security/evidence/amazon/ with a manifest.
#
# Run the day before the application, not from memory. Safe at any time: it
# only reads. Anything that needs a resource that does not exist yet is
# skipped and listed as missing in the manifest, so a partial pack is never
# mistaken for a complete one.
set -uo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
ORG_ID="378239481010"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/security/evidence/amazon"
mkdir -p "$OUT"
MANIFEST="$OUT/MANIFEST.md"
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '# Evidence pack — Amazon zone\n\nGenerated %s by infra/amazon/evidence.sh. Each file lists the command that produced it.\n\n| Control | Artifact | Status |\n|---|---|---|\n' "$STAMP" > "$MANIFEST"

capture() {   # capture <control> <file> <command...>
  local control="$1" file="$2"; shift 2
  local path="$OUT/$file"
  { printf '# %s\n# %s\n\n' "$STAMP" "$*"; "$@" 2>&1; } > "$path"
  local rc=$?
  # Presence is not correctness: a file whose body is empty, or is only an
  # error message from a resource that does not exist yet, is not evidence.
  local body; body=$(tail -n +4 "$path" | grep -v '^\s*$' | grep -v '^\[\]$' || true)
  # The bridge test's own lines legitimately say PERMISSION_DENIED / NOT_FOUND
  # (they are the expected refusals); they are not errors of the capture.
  local errscan; errscan=$(echo "$body" | grep -v '^bridgetest ' || true)
  if [ $rc -ne 0 ]; then printf '| %s | `%s` | **missing** (exit %s) |\n' "$control" "$file" "$rc" >> "$MANIFEST"
  elif [ -z "$body" ]; then printf '| %s | `%s` | **empty** — nothing to show yet |\n' "$control" "$file" >> "$MANIFEST"
  elif echo "$errscan" | grep -qi 'ERROR:\|NOT_FOUND\|could not be found\|does not exist\|PERMISSION_DENIED'; then printf '| %s | `%s` | **errors inside** — resource missing or refused |\n' "$control" "$file" >> "$MANIFEST"
  else printf '| %s | `%s` | captured |\n' "$control" "$file" >> "$MANIFEST"; fi
}

PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' 2>/dev/null || echo "")

# The bridge: who may invoke ingestAmazonEnvelope, and — across every Cloud
# Run service of the main project — whether any Amazon identity holds
# anything else. The scan takes about a minute; it is the point.
bridge_iam() {
  echo "== ingestAmazonEnvelope (eggcraft-studio) invoker policy"
  gcloud run services get-iam-policy ingestamazonenvelope --region="$REGION" --project=eggcraft-studio --format=yaml
  echo "== eggcraft-studio project-level bindings naming an Amazon identity"
  gcloud projects get-iam-policy eggcraft-studio --format=json | python3 -c '
import json,sys; p=json.load(sys.stdin)
for b in p["bindings"]:
    for m in b["members"]:
        if "nivadesk-amazon" in m or "amazon-caller" in m: print("  " + b["role"] + " -> " + m)'
  echo "== every Cloud Run service in eggcraft-studio with a binding for an Amazon identity"
  local list scan; list=$(mktemp); scan=$(mktemp)
  gcloud run services list --project=eggcraft-studio --format='value(metadata.name,metadata.labels."cloud.googleapis.com/location")' | tr '\t' ' ' > "$list"
  cat > "$scan" <<'SCAN'
#!/bin/bash
gcloud run services get-iam-policy "$1" --region="$2" --project=eggcraft-studio --format=json 2>/dev/null | python3 -c "
import json,sys
try: p=json.load(sys.stdin)
except Exception: print('$1 ($2): UNREADABLE'); sys.exit(0)
for b in p.get('bindings',[]):
    for m in b.get('members',[]):
        if 'nivadesk-amazon' in m or 'amazon-caller' in m or m in ('allUsers','allAuthenticatedUsers') and '$1'=='ingestamazonenvelope': print('$1 ($2): '+b['role']+' -> '+m)"
SCAN
  chmod +x "$scan"; xargs -P 8 -L 1 "$scan" < "$list" | sort
  echo "  ($(wc -l < "$list" | tr -d ' ') services scanned)"; rm -f "$list" "$scan"
}
admin_iam() {
  echo "== amazon-admin invoker policy"; gcloud run services get-iam-policy amazon-admin --region="$REGION" --project="$PROJECT" --format=yaml
  echo "== amazon-admin ingress: $(gcloud run services describe amazon-admin --region="$REGION" --project="$PROJECT" --format='value(metadata.annotations."run.googleapis.com/ingress")')"
  echo "== amazon-admin custom audiences (the only audience Cloud Run accepts for the public hostname): $(gcloud run services describe amazon-admin --region="$REGION" --project="$PROJECT" --format='value(metadata.annotations."run.googleapis.com/custom-audiences")')"
  echo "== amazon-diag job policy"; gcloud run jobs get-iam-policy amazon-diag --region="$REGION" --project="$PROJECT" --format=yaml
}
secret_iam() {
  for s in lwa-client-secret intent-hmac-key; do
    echo "== $s ($(gcloud secrets versions list "$s" --project="$PROJECT" --format='value(name)' 2>/dev/null | wc -l | tr -d ' ') version(s))"
    gcloud secrets get-iam-policy "$s" --project="$PROJECT" --format=yaml
  done
  echo "== project-level Secret Manager and custom-role bindings, with their conditions"
  gcloud projects get-iam-policy "$PROJECT" --format=json | python3 -c '
import json,sys; p=json.load(sys.stdin)
for b in p["bindings"]:
    if "secretmanager" in b["role"] or "/roles/" in b["role"]:
        print("  " + b["role"] + " -> " + ", ".join(b["members"]) + " | condition: " + b.get("condition",{}).get("expression","(none)"))'
  echo "== custom role amazonSecretCreator: $(gcloud iam roles describe amazonSecretCreator --project="$PROJECT" --format='value(includedPermissions)' 2>/dev/null)"
}
bridge_test_latest() {
  local exec; exec=$(gcloud run jobs executions list --job=amazon-bridge-test --project="$PROJECT" --region="$REGION" --sort-by=~metadata.creationTimestamp --limit=1 --format='value(metadata.name)' 2>/dev/null)
  [ -n "$exec" ] || { echo "no amazon-bridge-test execution"; return 1; }
  echo "execution: $exec"
  gcloud logging read "resource.type=\"cloud_run_job\" AND labels.\"run.googleapis.com/execution_name\"=\"$exec\" AND textPayload:\"bridgetest\"" \
    --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=30d --limit=30 --order=asc --format='value(textPayload)'
}

# Private Google Access: the zone, its records, the query-logging policy, the
# route and the firewall rule — and the newest amazon-diag execution's own
# lines (read from the amazon-audit bucket view).
pga_zone() {
  gcloud dns managed-zones describe googleapis-restricted --project="$PROJECT" --format='yaml(dnsName,visibility,privateVisibilityConfig)'
  gcloud dns record-sets list --zone=googleapis-restricted --project="$PROJECT" --format='table(name,type,ttl,rrdatas.list())'
  gcloud dns policies describe amazon-dns-logging --project="$PROJECT" --format='yaml(enableLogging,networks)'
}
pga_route_firewall() {
  gcloud compute routes describe amazon-restricted-vip --project="$PROJECT" --format='yaml(destRange,nextHopGateway,priority)'
  gcloud compute firewall-rules describe amazon-allow-restricted-vip --project="$PROJECT" --format='yaml(direction,priority,allowed,destinationRanges,logConfig)'
}
pga_diag_latest() {
  local exec; exec=$(gcloud run jobs executions list --job=amazon-diag --project="$PROJECT" --region="$REGION" --sort-by=~metadata.creationTimestamp --limit=1 --format='value(metadata.name)' 2>/dev/null)
  [ -n "$exec" ] || { echo "no amazon-diag execution yet"; return 1; }
  echo "execution: $exec"
  gcloud logging read "resource.type=\"cloud_run_job\" AND labels.\"run.googleapis.com/execution_name\"=\"$exec\" AND textPayload:\"diag \"" \
    --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=30d --limit=20 --format='value(textPayload)' | sort
}

# The operator's organisation-level roles, read live. The three temporary
# bootstrap roles (folderCreator, projectCreator, logging.admin) were removed
# on 2026-09-05 (bootstrap-iam-reduction.md); this fails if any is back.
operator_org_roles() {
  gcloud organizations get-iam-policy "$ORG_ID" --format=json | python3 -c '
import json,sys
p=json.load(sys.stdin); me="user:contact@eggcraft.co.uk"
held=[b["role"] for b in p.get("bindings",[]) if me in b.get("members",[])]
print("organisation-level roles held by " + me + ":")
for r in held: print("  " + r)
boot={"roles/resourcemanager.folderCreator","roles/resourcemanager.projectCreator","roles/logging.admin"}
left=sorted(boot & set(held))
print("temporary bootstrap roles still present:", ", ".join(left) if left else "none")
sys.exit(1 if left else 0)'
}

# Log reads name the amazon-audit bucket view: the _Default sink is disabled by
# design, so a plain --project read (which covers only _Default/_Required)
# would return nothing and look like "no events".
echo "══ Segmentation ══"
capture segmentation operator-org-roles.txt operator_org_roles
capture segmentation pga-private-zone.txt pga_zone
capture segmentation pga-route-and-firewall.txt pga_route_firewall
capture segmentation pga-diag-latest.txt pga_diag_latest
capture segmentation bridge-iam.txt bridge_iam
capture segmentation admin-iam.txt admin_iam
capture segmentation secret-iam.txt secret_iam
capture segmentation bridge-test-latest.txt bridge_test_latest
if [ -s "$OUT/bridge-test-2026-09-05.md" ]; then printf '| segmentation | `bridge-test-2026-09-05.md` | present (record of 2026-09-05) |\n' >> "$MANIFEST"; fi
for f in pga-diag-before.txt pga-diag-after.txt; do
  if [ -s "$OUT/$f" ]; then printf '| segmentation | `%s` | present (record of 2026-09-05) |\n' "$f" >> "$MANIFEST"
  else printf '| segmentation | `%s` | **missing** |\n' "$f" >> "$MANIFEST"; fi
done
for f in bootstrap-iam-reduction.md bootstrap-iam-org-policy-before.json bootstrap-iam-org-policy-after.json; do
  if [ -s "$OUT/$f" ]; then printf '| segmentation | `%s` | present (record of 2026-09-05) |\n' "$f" >> "$MANIFEST"
  else printf '| segmentation | `%s` | **missing** |\n' "$f" >> "$MANIFEST"; fi
done
POLICY=$(gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' 2>/dev/null | head -1)
capture segmentation perimeter.json gcloud access-context-manager perimeters describe amazon-information --policy="$POLICY" --format=json
capture segmentation org-policies.txt bash -c "for c in run.allowedIngress iam.disableServiceAccountKeyCreation iam.automaticIamGrantsForDefaultServiceAccounts compute.vmExternalIpAccess compute.restrictVpcPeering compute.skipDefaultNetworkCreation gcp.resourceLocations storage.uniformBucketLevelAccess; do echo \"== \$c\"; gcloud org-policies describe \$c --project=$PROJECT --format=yaml; done"
capture segmentation vpcsc-dryrun-report.txt gcloud logging read 'protoPayload.metadata.@type="type.googleapis.com/google.cloud.audit.VpcServiceControlAuditMetadata"' --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=30d --limit=500 --format='table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.serviceName,protoPayload.methodName,protoPayload.metadata.dryRun,protoPayload.metadata.violationReason)'
capture segmentation cross-project-read-denied.txt bash -c "gcloud firestore databases describe --database='(default)' --project=$PROJECT --impersonate-service-account=amazon-caller@eggcraft-studio.iam.gserviceaccount.com 2>&1 | head -5; echo '(expected: VPC_SERVICE_CONTROLS / PERMISSION_DENIED)'"

echo "══ Firewall / ACL ══"
capture firewall cloud-armor-policy.json gcloud compute security-policies describe amazon-edge --project="$PROJECT" --format=json
capture firewall lb-backend-services.json gcloud compute backend-services list --project="$PROJECT" --global --format=json
capture firewall lb-url-map.json gcloud compute url-maps describe amazon-edge-map --project="$PROJECT" --global --format=json
capture firewall lb-forwarding-rules.json gcloud compute forwarding-rules list --project="$PROJECT" --global --format=json
capture firewall lb-certificate-and-address.txt bash -c "gcloud compute ssl-certificates describe amazon-edge-cert --global --project=$PROJECT --format='yaml(managed,type,subjectAlternativeNames,expireTime)'; echo; gcloud compute addresses describe amazon-edge-ip --global --project=$PROJECT --format='value(address,status)'; echo; echo 'DNS:'; dig +short amazon.nivadesk.app @1.1.1.1"
if [ -s "$OUT/edge-smoke-2026-09-05.md" ]; then printf '| firewall | `edge-smoke-2026-09-05.md` | present (record of 2026-09-05) |\n' >> "$MANIFEST"; fi
capture firewall run-ingress.txt bash -c "for s in amazon-oauth amazon-admin amazon-sync; do echo \"\$s: \$(gcloud run services describe \$s --project=$PROJECT --region=$REGION --format='value(metadata.annotations.\"run.googleapis.com/ingress\",spec.template.spec.serviceAccountName)')\"; done"
capture firewall vpc-firewall-rules.json gcloud compute firewall-rules list --project="$PROJECT" --format=json
capture firewall nat-and-static-ip.txt bash -c "gcloud compute routers nats describe amazon-nat --router=amazon-router --region=$REGION --project=$PROJECT --format=yaml; gcloud compute addresses describe amazon-egress --region=$REGION --project=$PROJECT --format='value(address,status)'"
capture firewall subnet-flow-logs.txt gcloud compute networks subnets describe amazon-subnet --region="$REGION" --project="$PROJECT" --format='yaml(enableFlowLogs,logConfig,privateIpGoogleAccess,ipCidrRange)'
capture firewall run-app-closed-to-internet.txt bash -c "for s in amazon-oauth amazon-admin amazon-sync; do u=\$(gcloud run services describe \$s --project=$PROJECT --region=$REGION --format='value(status.url)'); echo \"\$u/healthz → \$(curl -s -o /dev/null -w '%{http_code}' -m 15 \$u/healthz)\"; done"
capture firewall armor-blocked-requests.txt gcloud logging read 'resource.type="http_load_balancer" AND jsonPayload.enforcedSecurityPolicy.outcome="DENY"' --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=30d --limit=20 --format='table(timestamp,httpRequest.remoteIp,httpRequest.requestUrl,jsonPayload.enforcedSecurityPolicy.priority,jsonPayload.enforcedSecurityPolicy.configuredAction)'
capture firewall egress-refused.txt gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"egress refused"' --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=30d --limit=20 --format='value(timestamp,resource.labels.service_name,textPayload)'
capture firewall nat-translations.txt gcloud logging read 'resource.type="nat_gateway"' --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=7d --limit=10 --format='value(timestamp,jsonPayload.connection.dest_ip,jsonPayload.connection.dest_port,jsonPayload.allocation_status)'

echo "══ IDS / IPS ══"
capture idsips scc-services.txt bash -c "gcloud scc settings services describe --project=$PROJECT --service=EVENT_THREAT_DETECTION --format=yaml 2>&1 | head -20; gcloud scc settings services describe --project=$PROJECT --service=CONTAINER_THREAT_DETECTION --format=yaml 2>&1 | head -5"
capture idsips scc-notification.json gcloud scc notifications describe amazon-findings --project="$PROJECT" --format=json
capture idsips scc-findings-sample.txt gcloud scc findings list --project="$PROJECT" --filter='state="ACTIVE"' --page-size=10 --format='table(finding.category,finding.severity,finding.eventTime,finding.resourceName)'
capture idsips log-bucket-retention.txt gcloud logging buckets describe amazon-audit --location="$REGION" --project="$PROJECT" --format='value(name,retentionDays,locked)'
capture idsips armor-adaptive-protection.txt gcloud compute security-policies describe amazon-edge --project="$PROJECT" --format='yaml(adaptiveProtectionConfig)'

echo "══ Anti-malware ══"
# The endpoint half is screenshots the user takes from the EDR/MDM consoles;
# they are listed here as expected files so their absence is visible.
for f in edr-console-devices.png edr-definitions-date.png edr-tamper-protection.png mdm-policy-export.pdf device-inventory.md; do
  if [ -s "$OUT/$f" ]; then printf '| anti-malware | `%s` | present (user-provided) |\n' "$f" >> "$MANIFEST"
  else printf '| anti-malware | `%s` | **missing** — user provides from the EDR/MDM console |\n' "$f" >> "$MANIFEST"; fi
done
capture anti-malware upload-scanner-production.txt bash -c "gcloud functions describe scanUploadedFile --region=europe-west2 --project=eggcraft-studio --gen2 --format='value(state,serviceConfig.environmentVariables.NIVADESK_MALWARE_SCAN)'; gcloud run services describe clamav-scanner --region=europe-west2 --project=eggcraft-studio --format='value(status.latestReadyRevisionName)'"

echo "══ Diagram ══"
capture diagram architecture.md bash -c "sed -n '/^## 1\. Architecture/,/^## 2\. Project/p' \"$(dirname "$0")/../../docs/security/amazon-hardened-project-design.md\""

echo
echo "manifest: $MANIFEST"
grep -c "| captured |\|present" "$MANIFEST" | sed 's/^/  captured or present: /'
grep -c "missing\|empty\|errors inside" "$MANIFEST" | sed 's/^/  missing, empty or with errors: /'
