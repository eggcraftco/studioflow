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
  if [ $rc -eq 0 ] && [ -s "$path" ]; then printf '| %s | `%s` | captured |\n' "$control" "$file" >> "$MANIFEST"
  else printf '| %s | `%s` | **missing** (exit %s) |\n' "$control" "$file" "$rc" >> "$MANIFEST"; fi
}

PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' 2>/dev/null || echo "")

echo "══ Segmentation ══"
POLICY=$(gcloud access-context-manager policies list --organization="$ORG_ID" --format='value(name)' 2>/dev/null | head -1)
capture segmentation perimeter.json gcloud access-context-manager perimeters describe amazon-information --policy="$POLICY" --format=json
capture segmentation org-policies.txt bash -c "for c in run.allowedIngress iam.disableServiceAccountKeyCreation iam.automaticIamGrantsForDefaultServiceAccounts compute.vmExternalIpAccess compute.restrictVpcPeering compute.skipDefaultNetworkCreation gcp.resourceLocations storage.uniformBucketLevelAccess; do echo \"== \$c\"; gcloud org-policies describe \$c --project=$PROJECT --format=yaml; done"
capture segmentation vpcsc-dryrun-report.txt gcloud logging read 'protoPayload.metadata.@type="type.googleapis.com/google.cloud.audit.VpcServiceControlAuditMetadata"' --project="$PROJECT" --freshness=30d --limit=500 --format='table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.serviceName,protoPayload.methodName,protoPayload.metadata.dryRun,protoPayload.metadata.violationReason)'
capture segmentation cross-project-read-denied.txt bash -c "gcloud firestore databases describe --database='(default)' --project=$PROJECT --impersonate-service-account=amazon-caller@eggcraft-studio.iam.gserviceaccount.com 2>&1 | head -5; echo '(expected: VPC_SERVICE_CONTROLS / PERMISSION_DENIED)'"

echo "══ Firewall / ACL ══"
capture firewall cloud-armor-policy.json gcloud compute security-policies describe amazon-edge --project="$PROJECT" --format=json
capture firewall lb-backend-services.json gcloud compute backend-services list --project="$PROJECT" --global --format=json
capture firewall lb-url-map.json gcloud compute url-maps describe amazon-edge-map --project="$PROJECT" --global --format=json
capture firewall lb-forwarding-rules.json gcloud compute forwarding-rules list --project="$PROJECT" --global --format=json
capture firewall run-ingress.txt bash -c "for s in amazon-oauth amazon-admin amazon-sync; do echo \"\$s: \$(gcloud run services describe \$s --project=$PROJECT --region=$REGION --format='value(metadata.annotations.\"run.googleapis.com/ingress\",spec.template.spec.serviceAccountName)')\"; done"
capture firewall vpc-firewall-rules.json gcloud compute firewall-rules list --project="$PROJECT" --format=json
capture firewall nat-and-static-ip.txt bash -c "gcloud compute routers nats describe amazon-nat --router=amazon-router --region=$REGION --project=$PROJECT --format=yaml; gcloud compute addresses describe amazon-egress --region=$REGION --project=$PROJECT --format='value(address,status)'"
capture firewall subnet-flow-logs.txt gcloud compute networks subnets describe amazon-subnet --region="$REGION" --project="$PROJECT" --format='yaml(enableFlowLogs,logConfig,privateIpGoogleAccess,ipCidrRange)'
capture firewall run-app-closed-to-internet.txt bash -c "for s in amazon-oauth amazon-admin amazon-sync; do u=\$(gcloud run services describe \$s --project=$PROJECT --region=$REGION --format='value(status.url)'); echo \"\$u/healthz → \$(curl -s -o /dev/null -w '%{http_code}' -m 15 \$u/healthz)\"; done"
capture firewall armor-blocked-requests.txt gcloud logging read 'resource.type="http_load_balancer" AND jsonPayload.enforcedSecurityPolicy.outcome="DENY"' --project="$PROJECT" --freshness=30d --limit=20 --format='table(timestamp,httpRequest.remoteIp,httpRequest.requestUrl,jsonPayload.enforcedSecurityPolicy.priority,jsonPayload.enforcedSecurityPolicy.configuredAction)'
capture firewall egress-refused.txt gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"egress refused"' --project="$PROJECT" --freshness=30d --limit=20 --format='value(timestamp,resource.labels.service_name,textPayload)'
capture firewall nat-translations.txt gcloud logging read 'resource.type="nat_gateway"' --project="$PROJECT" --freshness=7d --limit=10 --format='value(timestamp,jsonPayload.connection.dest_ip,jsonPayload.connection.dest_port,jsonPayload.allocation_status)'

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
grep -c "captured\|present" "$MANIFEST" | sed 's/^/  captured or present: /'
grep -c "missing" "$MANIFEST" | sed 's/^/  missing: /'
